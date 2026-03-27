const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { upload, UPLOADS_DIR, FILES_DIR, AVATARS_DIR } = require('../middleware/upload');
const { requireAuth } = require('../middleware/auth');

// POST upload a file (chat attachments — field name must be 'file')
router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  // Chat uploads always go to /uploads/files/ — fieldname 'file' routes there
  const url = `/api/files/uploads/${req.file.filename}`;

  res.json({
    url,
    filename: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype,
    storedName: req.file.filename
  });
});

// GET serve avatar
router.get('/avatars/:filename', (req, res) => {
  const filePath = path.join(AVATARS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// GET serve uploaded file
router.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(FILES_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const { download } = req.query;
  if (download) {
    res.download(filePath, req.query.name || req.params.filename);
  } else {
    res.sendFile(filePath);
  }
});

module.exports = router;
