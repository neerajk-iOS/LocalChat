const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'localchat-dev-secret-change-in-production-min-32-chars';

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Optional auth — populates req.userId if token is present but doesn't block
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const payload = verifyToken(authHeader.slice(7));
      req.userId = payload.userId;
    } catch { /* ignore */ }
  }
  next();
}

module.exports = { requireAuth, optionalAuth, verifyToken, JWT_SECRET };
