const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

function toUserDto(user) {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username,
    displayName: user.displayName || '',
    bio: user.bio || '',
    avatarUrl: user.avatarUrl || '',
    avatarBase64: user.avatarBase64 || '',
    bannerBase64: user.bannerBase64 || '',
    followersCount: Array.isArray(user.followers) ? user.followers.length : 0,
    followingCount: Array.isArray(user.following) ? user.following.length : 0,
    privacy: {
      likesPublic: user?.privacy?.likesPublic !== false,
      playlistsPublic: user?.privacy?.playlistsPublic !== false
    }
  };
}

function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT secret not configured');

  return jwt.sign(
    {
      sub: String(userId)
    },
    secret,
    {
      expiresIn: '30d'
    }
  );
}

router.post('/register', async (req, res) => {
  try {
    const { email, username, password } = req.body || {};

    if (!email || !username || !password) {
      return res.status(400).json({ success: false, error: 'email, username, password required' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, error: 'password too short' });
    }

    const existing = await User.findOne({ $or: [{ email: String(email).toLowerCase() }, { username }] });
    if (existing) {
      return res.status(409).json({ success: false, error: 'user already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: String(email).toLowerCase(),
      username: String(username),
      passwordHash
    });

    const token = signToken(user._id);
    return res.json({
      success: true,
      token,
      user: toUserDto(user)
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body || {};

    if (!login || !password) {
      return res.status(400).json({ success: false, error: 'login and password required' });
    }

    const q = String(login);
    const user = await User.findOne({
      $or: [{ email: q.toLowerCase() }, { username: q }]
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'invalid credentials' });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, error: 'invalid credentials' });
    }

    const token = signToken(user._id);
    return res.json({
      success: true,
      token,
      user: toUserDto(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/me', async (req, res) => {
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
    const user = await User.findById(payload.sub).select('_id email username displayName bio avatarUrl avatarBase64 bannerBase64 followers following privacy');
    if (!user) {
      return res.status(404).json({ success: false, error: 'user not found' });
    }

    return res.json({
      success: true,
      user: toUserDto(user)
    });
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
});

module.exports = router;
