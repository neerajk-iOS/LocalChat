const express = require('express');
const router = express.Router();
const db = require('../db');

// GET paginated message history for a room
router.get('/:roomId', (req, res) => {
  const { roomId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const before = req.query.before ? parseInt(req.query.before) : Date.now() + 1;

  const messages = db.prepare(`
    SELECT m.*,
      u.display_name as sender_name,
      u.avatar_url as sender_avatar,
      r.content as reply_content,
      ru.display_name as reply_sender_name,
      r.type as reply_type,
      r.file_name as reply_file_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN messages r ON r.id = m.reply_to_id
    LEFT JOIN users ru ON ru.id = r.sender_id
    WHERE m.room_id = ? AND m.created_at < ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(roomId, before, limit);

  // Attach reactions to each message
  const withReactions = messages.reverse().map(msg => {
    const reactions = db.prepare(`
      SELECT emoji, user_id, u.display_name
      FROM reactions r JOIN users u ON u.id = r.user_id
      WHERE r.message_id = ?
    `).all(msg.id);

    // Group reactions by emoji
    const reactionMap = {};
    reactions.forEach(r => {
      if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
      reactionMap[r.emoji].count++;
      reactionMap[r.emoji].users.push({ id: r.user_id, name: r.display_name });
    });

    return { ...msg, reactions: Object.values(reactionMap) };
  });

  res.json(withReactions);
});

// GET search messages
router.get('/search/:roomId', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const messages = db.prepare(`
    SELECT m.*, u.display_name as sender_name, u.avatar_url as sender_avatar
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.room_id = ? AND m.content LIKE ? AND m.is_deleted = 0
    ORDER BY m.created_at DESC
    LIMIT 50
  `).all(req.params.roomId, `%${q}%`);

  res.json(messages);
});

module.exports = router;
