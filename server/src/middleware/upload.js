const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const uploadDir = () => path.resolve(__dirname, '../..', process.env.UPLOAD_DIR || 'uploads');
const OK = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(uploadDir(), { recursive: true }); cb(null, uploadDir()); },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${OK[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => OK[file.mimetype] ? cb(null, true) : cb(Object.assign(new Error('Bills must be JPG, PNG, WEBP or PDF files'), { status: 400 })),
});
const removeFile = (name) => { if (name) fs.promises.unlink(path.join(uploadDir(), path.basename(name))).catch(() => {}); };
module.exports = { upload, uploadDir, removeFile, OK };
