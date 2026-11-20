module.exports = (err, req, res, next) => { // eslint-disable-line
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Bill file is too large (max 5 MB)' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
  if (err.code === 11000) return res.status(409).json({ message: 'Duplicate record' });
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server' });
};
