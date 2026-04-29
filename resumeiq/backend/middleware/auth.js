const jwt = require('jsonwebtoken');
const { Users } = require('../utils/store');

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = Users.getById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    // Attach sanitised user (no password)
    const { passwordHash, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired, please sign in again' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};
