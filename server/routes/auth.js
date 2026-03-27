const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { upload } = require('../middleware/upload');
const { JWT_SECRET } = require('../middleware/auth');

const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

  const rawRefresh = crypto.randomBytes(48).toString('hex');
  const refreshHash = crypto.createHash('sha256').update(rawRefresh).digest('hex');
  const expiresAt   = Date.now() + REFRESH_TOKEN_TTL;

  db.prepare(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(uuidv4(), userId, refreshHash, expiresAt, Date.now());

  // Keep at most 5 refresh tokens per user (prune oldest)
  const tokens = db.prepare(
    'SELECT id FROM refresh_tokens WHERE user_id = ? ORDER BY created_at ASC'
  ).all(userId);
  if (tokens.length > 5) {
    const toDelete = tokens.slice(0, tokens.length - 5).map(t => t.id);
    const placeholders = toDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM refresh_tokens WHERE id IN (${placeholders})`).run(...toDelete);
  }

  return { accessToken, refreshToken: rawRefresh };
}

// ── POST /api/auth/register ──────────────────────────────
router.post('/register', upload.single('avatar'), async (req, res) => {
  try {
    const { display_name, email, password, bio } = req.body;

    if (!display_name?.trim()) return res.status(400).json({ error: 'display_name is required' });
    if (!email?.trim())        return res.status(400).json({ error: 'email is required' });
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const emailNorm = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id  = uuidv4();
    const now = Date.now();

    const rawIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket.remoteAddress || 'unknown';
    const ip = rawIp.replace(/^::ffff:/, '');

    let avatar_url = null;
    if (req.file) avatar_url = `/api/files/avatars/${req.file.filename}`;

    db.prepare(
      `INSERT INTO users (id, display_name, avatar_url, bio, status, ip_address, email, password_hash, created_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, display_name.trim(), avatar_url, bio || '', 'online', ip, emailNorm, passwordHash, now, now);

    const { accessToken, refreshToken } = generateTokens(id);
    const user = db.prepare(
      'SELECT id, display_name, avatar_url, status, bio, email, created_at, last_seen FROM users WHERE id = ?'
    ).get(id);

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    console.error('[Auth] register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const emailNorm = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(emailNorm);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    if (user.is_banned) return res.status(403).json({ error: 'Account is suspended' });

    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account requires a password reset. Contact admin.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    db.prepare('UPDATE users SET last_seen = ?, status = ? WHERE id = ?')
      .run(Date.now(), 'online', user.id);

    const { accessToken, refreshToken } = generateTokens(user.id);
    const safeUser = db.prepare(
      'SELECT id, display_name, avatar_url, status, bio, email, created_at, last_seen FROM users WHERE id = ?'
    ).get(user.id);

    res.json({ user: safeUser, accessToken, refreshToken });
  } catch (err) {
    console.error('[Auth] login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = db.prepare(
    'SELECT * FROM refresh_tokens WHERE token_hash = ?'
  ).get(tokenHash);

  if (!stored) return res.status(401).json({ error: 'Invalid refresh token' });
  if (stored.expires_at < Date.now()) {
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(stored.id);
    return res.status(401).json({ error: 'Refresh token expired', code: 'REFRESH_EXPIRED' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(stored.user_id);
  if (!user || user.is_banned) {
    return res.status(401).json({ error: 'Account not found or suspended' });
  }

  // Rotate: delete old, issue new
  db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(stored.id);
  const { accessToken, refreshToken: newRefresh } = generateTokens(user.id);

  res.json({ accessToken, refreshToken: newRefresh });
});

// ── POST /api/auth/logout ────────────────────────────────
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);
  }
  res.json({ ok: true });
});

// ── GET /api/auth/me ─────────────────────────────────────
router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, display_name, avatar_url, status, bio, email, created_at, last_seen FROM users WHERE id = ?'
  ).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
