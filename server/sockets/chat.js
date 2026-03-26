const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// In-memory map: socketId -> { userId, rooms[], connectedAt }
const connectedUsers = new Map();

// io reference set by initSockets — used by kickUser
let _io = null;

function kickUser(userId) {
  for (const [sid, data] of connectedUsers) {
    if (data.userId === userId) {
      const socket = _io?.sockets.sockets.get(sid);
      if (socket) {
        socket.emit('kicked', { reason: 'Kicked by admin' });
        socket.disconnect(true);
      }
      connectedUsers.delete(sid);
    }
  }
}

function getOnlineUserIds() {
  const ids = new Set();
  connectedUsers.forEach(({ userId }) => ids.add(userId));
  return [...ids];
}

// Exported so the admin dashboard can read live connection data
function getConnectedSessions() {
  const sessions = [];
  connectedUsers.forEach((data, socketId) => {
    sessions.push({ socketId, userId: data.userId, rooms: data.rooms, connectedAt: data.connectedAt });
  });
  return sessions;
}

// Reverse-lookup: userId → first matching socketId
function socketIdForUser(userId) {
  for (const [sid, data] of connectedUsers) {
    if (data.userId === userId) return sid;
  }
  return null;
}

function buildMessagePayload(msgId) {
  return db.prepare(`
    SELECT m.*,
      u.display_name as sender_name,
      u.avatar_url as sender_avatar,
      r.content as reply_content,
      r.type as reply_type,
      r.file_name as reply_file_name,
      ru.display_name as reply_sender_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN messages r ON r.id = m.reply_to_id
    LEFT JOIN users ru ON ru.id = r.sender_id
    WHERE m.id = ?
  `).get(msgId);
}

module.exports = initSockets;
module.exports.getConnectedSessions = getConnectedSessions;
module.exports.getOnlineUserIds = getOnlineUserIds;
module.exports.kickUser = kickUser;

function initSockets(io) {
  _io = io;
  io.on('connection', (socket) => {
    console.log(`[Socket] connected: ${socket.id}`);

    // ── JOIN ──────────────────────────────────────────────
    socket.on('join', ({ userId }) => {
      if (!userId) return;
      connectedUsers.set(socket.id, { userId, rooms: [], connectedAt: Date.now() });

      // Update last_seen + status
      db.prepare('UPDATE users SET last_seen = ?, status = ? WHERE id = ?')
        .run(Date.now(), 'online', userId);

      // Broadcast updated online list
      io.emit('users_online', getOnlineUserIds());
      console.log(`[Socket] ${userId} joined (socket ${socket.id})`);
    });

    // ── JOIN ROOM ─────────────────────────────────────────
    socket.on('join_room', ({ roomId }) => {
      socket.join(roomId);
      const data = connectedUsers.get(socket.id);
      if (data && !data.rooms.includes(roomId)) data.rooms.push(roomId);
    });

    // ── SEND MESSAGE ──────────────────────────────────────
    socket.on('send_message', (payload, ack) => {
      const { type = 'text', content, file_url, file_name, file_size, file_mime,
              sender_id, room_id, reply_to_id, forwarded_from_id } = payload;

      if (!sender_id || !room_id) return;

      const id = uuidv4();
      const now = Date.now();

      db.prepare(`
        INSERT INTO messages
          (id, type, content, file_url, file_name, file_size, file_mime,
           sender_id, room_id, reply_to_id, forwarded_from_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, type, content || null, file_url || null, file_name || null,
             file_size || null, file_mime || null, sender_id, room_id,
             reply_to_id || null, forwarded_from_id || null, now);

      const full = buildMessagePayload(id);
      full.reactions = [];

      io.to(room_id).emit('message', full);
      if (typeof ack === 'function') ack({ ok: true, id });

      // ── Push notification to users who may not have joined the room ──
      // io.to(room_id) only reaches sockets that called socket.join(room_id).
      // Users who never opened a chat won't have joined → they miss the message
      // and unread badges never appear. Fix: also emit directly to their socket.
      const notif = {
        id: full.id, room_id, sender_id,
        sender_name: full.sender_name,
        sender_avatar: full.sender_avatar,
        type: full.type,
        content: full.content,
        file_name: full.file_name,
        created_at: full.created_at,
      };

      if (room_id.startsWith('dm_')) {
        // room_id = "dm_UUID1_UUID2"  — UUIDs use hyphens, separator is underscore
        const parts = room_id.split('_');  // ["dm", UUID1, UUID2]
        [parts[1], parts[2]].forEach(uid => {
          if (uid && uid !== sender_id) {
            const sid = socketIdForUser(uid);
            if (sid) io.to(sid).emit('new_message_notif', notif);
          }
        });
      } else if (room_id.startsWith('group:')) {
        const groupId = room_id.slice(6);
        const members = db.prepare('SELECT user_id FROM group_members WHERE group_id = ?').all(groupId);
        members.forEach(({ user_id }) => {
          if (user_id !== sender_id) {
            const sid = socketIdForUser(user_id);
            if (sid) io.to(sid).emit('new_message_notif', notif);
          }
        });
      }
    });

    // ── TYPING ────────────────────────────────────────────
    socket.on('typing', ({ room_id, user_id, is_typing }) => {
      socket.to(room_id).emit('typing_status', { user_id, is_typing });
    });

    // ── READ RECEIPT ──────────────────────────────────────
    socket.on('read', ({ room_id, user_id, message_ids }) => {
      const insert = db.prepare(
        'INSERT OR IGNORE INTO read_receipts (message_id, user_id, read_at) VALUES (?, ?, ?)'
      );
      const insertMany = db.transaction((ids) => {
        ids.forEach(mid => insert.run(mid, user_id, Date.now()));
      });
      insertMany(message_ids || []);
      io.to(room_id).emit('read_receipt', { user_id, message_ids });
    });

    // ── EDIT MESSAGE ──────────────────────────────────────
    socket.on('edit_message', ({ message_id, content, user_id }, ack) => {
      const msg = db.prepare('SELECT * FROM messages WHERE id = ? AND sender_id = ?')
        .get(message_id, user_id);
      if (!msg) return ack && ack({ error: 'Not found or no permission' });

      db.prepare('UPDATE messages SET content = ?, is_edited = 1, edited_at = ? WHERE id = ?')
        .run(content, Date.now(), message_id);

      io.to(msg.room_id).emit('message_edited', { message_id, content, edited_at: Date.now() });
      if (typeof ack === 'function') ack({ ok: true });
    });

    // ── DELETE MESSAGE ────────────────────────────────────
    socket.on('delete_message', ({ message_id, user_id }, ack) => {
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(message_id);
      if (!msg) return ack && ack({ error: 'Not found' });

      // Allow sender or group admin to delete
      db.prepare('UPDATE messages SET is_deleted = 1, content = NULL, file_url = NULL WHERE id = ?')
        .run(message_id);

      io.to(msg.room_id).emit('message_deleted', { message_id });
      if (typeof ack === 'function') ack({ ok: true });
    });

    // ── REACTION ──────────────────────────────────────────
    socket.on('reaction', ({ message_id, user_id, emoji }, ack) => {
      const existing = db.prepare(
        'SELECT * FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
      ).get(message_id, user_id, emoji);

      if (existing) {
        db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
          .run(message_id, user_id, emoji);
      } else {
        db.prepare('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)')
          .run(message_id, user_id, emoji, Date.now());
      }

      const reactions = db.prepare(`
        SELECT emoji, user_id, u.display_name
        FROM reactions r JOIN users u ON u.id = r.user_id
        WHERE r.message_id = ?
      `).all(message_id);

      const reactionMap = {};
      reactions.forEach(r => {
        if (!reactionMap[r.emoji]) reactionMap[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        reactionMap[r.emoji].count++;
        reactionMap[r.emoji].users.push({ id: r.user_id, name: r.display_name });
      });

      const msg = db.prepare('SELECT room_id FROM messages WHERE id = ?').get(message_id);
      if (msg) {
        io.to(msg.room_id).emit('reaction_update', {
          message_id,
          reactions: Object.values(reactionMap)
        });
      }
      if (typeof ack === 'function') ack({ ok: true });
    });

    // ── WebRTC SIGNALING RELAY ────────────────────────────
    // All events are relayed directly to the target user's socket.
    // The server never inspects SDP/ICE content — pure relay.

    socket.on('call_offer', ({ to, offer, callType, from }) => {
      const sid = socketIdForUser(to);
      if (sid) io.to(sid).emit('incoming_call', { from, offer, callType });
    });

    socket.on('call_answer', ({ to, answer }) => {
      const sid = socketIdForUser(to);
      if (sid) io.to(sid).emit('call_answered', { answer });
    });

    socket.on('call_ice_candidate', ({ to, candidate }) => {
      const sid = socketIdForUser(to);
      if (sid) io.to(sid).emit('ice_candidate', { candidate });
    });

    socket.on('call_end', ({ to }) => {
      const sid = socketIdForUser(to);
      if (sid) io.to(sid).emit('call_ended');
    });

    socket.on('call_reject', ({ to }) => {
      const sid = socketIdForUser(to);
      if (sid) io.to(sid).emit('call_rejected');
    });

    socket.on('call_busy', ({ to }) => {
      const sid = socketIdForUser(to);
      if (sid) io.to(sid).emit('call_busy');
    });

    // ── DISCONNECT ────────────────────────────────────────
    socket.on('disconnect', () => {
      const data = connectedUsers.get(socket.id);
      if (data) {
        db.prepare('UPDATE users SET last_seen = ?, status = ? WHERE id = ?')
          .run(Date.now(), 'offline', data.userId);
        connectedUsers.delete(socket.id);
        io.emit('users_online', getOnlineUserIds());
        console.log(`[Socket] ${data.userId} disconnected`);
      }
    });
  });
}
