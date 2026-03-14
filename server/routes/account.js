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

    const update = {};
    if (typeof body.displayName === 'string') update.displayName = body.displayName.trim();
    if (typeof body.bio === 'string') update.bio = body.bio.trim();
    if (typeof body.avatarUrl === 'string') update.avatarUrl = body.avatarUrl.trim();

    if (body.privacy && typeof body.privacy === 'object') {
      if (typeof body.privacy.likesPublic === 'boolean') update['privacy.likesPublic'] = body.privacy.likesPublic;
      if (typeof body.privacy.playlistsPublic === 'boolean') update['privacy.playlistsPublic'] = body.privacy.playlistsPublic;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true }
    ).select('_id email username displayName bio avatarUrl privacy');

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
