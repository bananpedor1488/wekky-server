const jwt = require('jsonwebtoken');

function authRequired(req, res, next) {
  try {
    const header = String(req.headers.authorization || '');
    const [type, token] = header.split(' ');

    if (type !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, error: 'JWT secret not configured' });
    }

    const payload = jwt.verify(token, secret);
    req.user = { id: payload.sub };
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}

module.exports = { authRequired };
