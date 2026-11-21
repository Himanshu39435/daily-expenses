const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { roleFor } = require('../utils/roles');
const { authVersionMatches } = require('../utils/authVersion');
module.exports = async (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Please sign in' });
    const { id, v = 0 } = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(id).select('-password').lean();
    if (!user) return res.status(401).json({ message: 'Account not found' });
    if (!authVersionMatches(v, user.authVersion)) return res.status(401).json({ message: 'Session expired, please sign in again' });
    user.role = roleFor(user);
    if (user.role === 'admin' && !user.organizationId) user.organizationId = user._id;
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Session expired, please sign in again' });
  }
};
