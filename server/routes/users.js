const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('../db');
const { upload, AVATARS_DIR } = require('../middleware/upload');

// GET all users
router.get('/', (req, res) => {
  const users = db.prepare('SELECT id, display_name, avatar_url, status, bio, created_at, last_seen FROM users ORDER BY display_name').all();
  res.json(users);
});

// GET single user
router.get('/:id', (req, res) => {
  const user = db.prepare('SELECT id, display_name, avatar_url, status, bio, created_at, last_seen FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// POST register new user
router.post('/', upload.single('avatar'), (req, res) => {
  const { display_name, bio, email } = req.body;
  if (!display_name || !display_name.trim()) {
    return res.status(400).json({ error: 'display_name is required' });
  }

  // Email validation
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'email is required' });
  }
  const emailNorm = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailNorm)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  // One account per email
  const emailTaken = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
  if (emailTaken) {
    return res.status(409).json({
      error: 'An account with this email already exists.',
      existingUserId: emailTaken.id,
    });
  }

  // Resolve client IP (LAN-aware; prefers X-Forwarded-For for reverse-proxy setups)
  const rawIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress
    || 'unknown';
  // Normalise IPv6-mapped IPv4 (e.g. ::ffff:127.0.0.1 → 127.0.0.1)
  const ip = rawIp.replace(/^::ffff:/, '');

  // Skip one-per-IP enforcement for loopback (localhost dev / server-local access)
  const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === 'unknown';

  if (!isLoopback) {
    // One-user-per-IP: block duplicate registrations from the same LAN device
    const existingReg = db.prepare('SELECT user_id FROM ip_registrations WHERE ip = ?').get(ip);
    if (existingReg) {
      return res.status(409).json({
        error: 'A user is already registered from this device.',
        existingUserId: existingReg.user_id,
      });
    }

    // Block banned IPs
    const banned = db.prepare(
      'SELECT id FROM users WHERE ip_address = ? AND is_banned = 1'
    ).get(ip);
    if (banned) {
      return res.status(403).json({ error: 'Registration from this network is not allowed.' });
    }
  }

  const id = uuidv4();
  const now = Date.now();
  let avatar_url = null;

  if (req.file) {
    avatar_url = `/api/files/avatars/${req.file.filename}`;
  }

  db.prepare(
    'INSERT INTO users (id, display_name, avatar_url, bio, status, ip_address, email, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, display_name.trim(), avatar_url, bio || '', 'online', ip, emailNorm, now, now);

  // Record IP → user mapping
  db.prepare(
    'INSERT OR IGNORE INTO ip_registrations (ip, user_id, registered_at) VALUES (?, ?, ?)'
  ).run(ip, id, now);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json(user);
});

// PUT update user
router.put('/:id', upload.single('avatar'), (req, res) => {
  const { display_name, bio, status } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  let avatar_url = user.avatar_url;
  if (req.file) {
    avatar_url = `/api/files/avatars/${req.file.filename}`;
  }

  db.prepare(
    'UPDATE users SET display_name = ?, avatar_url = ?, bio = ?, status = ?, last_seen = ? WHERE id = ?'
  ).run(
    display_name?.trim() || user.display_name,
    avatar_url,
    bio !== undefined ? bio : user.bio,
    status || user.status,
    Date.now(),
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// PATCH update last_seen
router.patch('/:id/seen', (req, res) => {
  db.prepare('UPDATE users SET last_seen = ?, status = ? WHERE id = ?').run(Date.now(), 'online', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
