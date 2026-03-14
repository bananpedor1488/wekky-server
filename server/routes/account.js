const express = require('express');
const UserState = require('../models/UserState');
const User = require('../models/User');
const { authRequired } = require('../middleware/authRequired');

const router = express.Router();

router.get('/state', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const doc = await UserState.findOne({ userId }).lean();
    return res.json({ success: true, data: doc?.data || {} });
  } catch (error) {
    console.error('Get state error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/state', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = req.body || {};

    const doc = await UserState.findOneAndUpdate(
      { userId },
      { $set: { data } },
      { new: true, upsert: true }
    ).lean();

    return res.json({ success: true, data: doc.data });
  } catch (error) {
    console.error('Update state error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/profile', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    const isImageDataUrl = (s) => {
      if (typeof s !== 'string') return false;
      return /^data:image\/[a-z0-9+.-]+;base64,/i.test(s);
    };

    const byteLen = (s) => {
      try {
        return Buffer.byteLength(String(s || ''), 'utf8');
      } catch (e) {
        return String(s || '').length;
      }
    };

    const MAX_AVATAR_BYTES = 350 * 1024;
    const MAX_BANNER_BYTES = 900 * 1024;

    const update = {};
    if (typeof body.username === 'string') {
      const nextUsername = body.username.trim();
      if (!nextUsername) {
        return res.status(400).json({ success: false, error: 'username required' });
      }
      if (!/^[a-zA-Z0-9_\.]{3,20}$/.test(nextUsername)) {
        return res.status(400).json({
          success: false,
          error: 'invalid username'
        });
      }
      const existing = await User.findOne({
        username: new RegExp(`^${nextUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        _id: { $ne: userId }
      }).select('_id');
      if (existing) {
        return res.status(409).json({ success: false, error: 'username already taken' });
      }
      update.username = nextUsername;
    }
    if (typeof body.displayName === 'string') update.displayName = body.displayName.trim();
    if (typeof body.bio === 'string') update.bio = body.bio.trim();
    if (typeof body.avatarUrl === 'string') update.avatarUrl = body.avatarUrl.trim();

    if (typeof body.avatarBase64 === 'string') {
      const v = body.avatarBase64.trim();
      if (v && !isImageDataUrl(v)) {
        return res.status(400).json({ success: false, error: 'avatarBase64 must be a data:image/*;base64 URL' });
      }
      if (v && byteLen(v) > MAX_AVATAR_BYTES) {
        return res.status(413).json({ success: false, error: 'avatar image too large' });
      }
      update.avatarBase64 = v;
    }

    if (typeof body.bannerBase64 === 'string') {
      const v = body.bannerBase64.trim();
      if (v && !isImageDataUrl(v)) {
        return res.status(400).json({ success: false, error: 'bannerBase64 must be a data:image/*;base64 URL' });
      }
      if (v && byteLen(v) > MAX_BANNER_BYTES) {
        return res.status(413).json({ success: false, error: 'banner image too large' });
      }
      update.bannerBase64 = v;
    }

    if (body.privacy && typeof body.privacy === 'object') {
      if (typeof body.privacy.likesPublic === 'boolean') update['privacy.likesPublic'] = body.privacy.likesPublic;
      if (typeof body.privacy.playlistsPublic === 'boolean') update['privacy.playlistsPublic'] = body.privacy.playlistsPublic;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true }
    ).select('_id email username displayName bio avatarUrl avatarBase64 bannerBase64 followers following privacy');

    if (!user) {
      return res.status(404).json({ success: false, error: 'user not found' });
    }

    return res.json({
      success: true,
      user: {
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
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
