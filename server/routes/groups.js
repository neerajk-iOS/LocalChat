const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { upload } = require('../middleware/upload');

// GET all groups for a user
router.get('/', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const groups = db.prepare(`
    SELECT g.*, 
      (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
      gm.role as my_role
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ?
    ORDER BY g.created_at DESC
  `).all(userId);

  res.json(groups);
});

// GET group details with members
router.get('/:id', (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const members = db.prepare(`
    SELECT u.id, u.display_name, u.avatar_url, u.status, u.last_seen, gm.role, gm.joined_at
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.role DESC, u.display_name
  `).all(req.params.id);

  res.json({ ...group, members });
});

// POST create group
router.post('/', upload.single('avatar'), (req, res) => {
  const { name, description, created_by, member_ids } = req.body;
  if (!name || !created_by) return res.status(400).json({ error: 'name and created_by required' });

  const id = uuidv4();
  const now = Date.now();
  let avatar_url = null;
  if (req.file) {
    avatar_url = `/api/files/avatars/${req.file.filename}`;
  }

  const createGroup = db.transaction(() => {
    db.prepare('INSERT INTO groups (id, name, description, avatar_url, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name.trim(), description || '', avatar_url, created_by, now);

    // Add creator as admin
    db.prepare('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(id, created_by, 'admin', now);

    // Add other members
    let extraIds = [];
    if (member_ids) {
      try { extraIds = JSON.parse(member_ids); } catch { extraIds = []; }
    }
    extraIds.forEach(uid => {
      if (uid !== created_by) {
        db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
          .run(id, uid, 'member', now);
      }
    });
  });

  createGroup();

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  const members = db.prepare(`
    SELECT u.id, u.display_name, u.avatar_url, u.status, gm.role
    FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?
  `).all(id);

  res.status(201).json({ ...group, members });
});

// PUT update group
router.put('/:id', upload.single('avatar'), (req, res) => {
  const { name, description, requesterId } = req.body;
  const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(req.params.id, requesterId);
  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can update group' });
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  let avatar_url = group.avatar_url;
  if (req.file) avatar_url = `/api/files/avatars/${req.file.filename}`;

  db.prepare('UPDATE groups SET name = ?, description = ?, avatar_url = ? WHERE id = ?')
    .run(name?.trim() || group.name, description !== undefined ? description : group.description, avatar_url, req.params.id);

  res.json(db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id));
});

// POST add member
router.post('/:id/members', (req, res) => {
  const { userId, requesterId } = req.body;
  const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(req.params.id, requesterId);
  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can add members' });
  }

  db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
    .run(req.params.id, userId, 'member', Date.now());

  res.json({ ok: true });
});

// DELETE remove member
router.delete('/:id/members/:userId', (req, res) => {
  const { requesterId } = req.body;
  const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(req.params.id, requesterId);
  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can remove members' });
  }

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')
    .run(req.params.id, req.params.userId);

  res.json({ ok: true });
});

// PATCH promote / demote member
router.patch('/:id/members/:userId/role', (req, res) => {
  const { role, requesterId } = req.body;
  const membership = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(req.params.id, requesterId);
  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can change roles' });
  }
  db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?')
    .run(role, req.params.id, req.params.userId);
  res.json({ ok: true });
});

module.exports = router;
