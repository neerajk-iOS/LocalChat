const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');
const FILES_DIR = path.join(UPLOADS_DIR, 'files');

// Ensure directories exist
[UPLOADS_DIR, AVATARS_DIR, FILES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use the form field name to decide the directory — not the URL path,
    // which is relative to the router and won't contain "avatar" for /api/users.
    const isAvatar = file.fieldname === 'avatar';
    cb(null, isAvatar ? AVATARS_DIR : FILES_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Allow all file types
  cb(null, true);
};

const upload = multer({
  storage: fileStorage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  }
});

module.exports = { upload, UPLOADS_DIR, AVATARS_DIR, FILES_DIR };
