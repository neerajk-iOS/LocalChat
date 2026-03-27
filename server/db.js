const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'localchat.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    status TEXT DEFAULT 'online',
    bio TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    avatar_url TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'text',
    content TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size INTEGER,
    file_mime TEXT,
    sender_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    reply_to_id TEXT,
    forwarded_from_id TEXT,
    is_deleted INTEGER DEFAULT 0,
    is_edited INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    edited_at INTEGER,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (reply_to_id) REFERENCES messages(id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS read_receipts (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    read_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

  CREATE TABLE IF NOT EXISTS ip_registrations (
    ip      TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    registered_at INTEGER NOT NULL
  );
`);

// Safe column additions
for (const sql of [
  `ALTER TABLE users ADD COLUMN is_banned     INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN ban_reason    TEXT`,
  `ALTER TABLE users ADD COLUMN ip_address    TEXT`,
  `ALTER TABLE users ADD COLUMN email         TEXT`,
  `ALTER TABLE users ADD COLUMN password_hash TEXT`,
]) {
  try { db.exec(sql); } catch { /* column already exists */ }
}

// Unique index on email
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);
} catch { /* already exists */ }

// Refresh tokens table for JWT rotation
db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
`);

module.exports = db;
