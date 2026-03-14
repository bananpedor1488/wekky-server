const express = require('express');
const User = require('../models/User');
const UserState = require('../models/UserState');

const router = express.Router();

function toPublicUserDto(user) {
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName || '',
    bio: user.bio || '',
    avatarUrl: user.avatarUrl || '',
    avatarBase64: user.avatarBase64 || '',
    bannerBase64: user.bannerBase64 || '',
    privacy: {
      likesPublic: user?.privacy?.likesPublic !== false,
      playlistsPublic: user?.privacy?.playlistsPublic !== false
    }
  };
}

router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.max(1, Math.min(25, parseInt(req.query.limit || '10', 10) || 10));

    if (!q) {
      return res.status(400).json({ success: false, error: 'q required' });
    }

    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const users = await User.find({
      $or: [{ username: re }, { displayName: re }]
    })
      .select('_id username displayName bio avatarUrl avatarBase64 bannerBase64 privacy')
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      count: users.length,
      results: users.map(toPublicUserDto)
    });
  } catch (error) {
    console.error('Users search error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:username', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) return res.status(400).json({ success: false, error: 'username required' });

    const user = await User.findOne({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .select('_id username displayName bio avatarUrl avatarBase64 bannerBase64 privacy')
      .lean();

    if (!user) return res.status(404).json({ success: false, error: 'user not found' });

    return res.json({ success: true, user: toPublicUserDto(user) });
  } catch (error) {
    console.error('Get public user error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:username/likes', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) return res.status(400).json({ success: false, error: 'username required' });

    const user = await User.findOne({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .select('_id username privacy')
      .lean();

    if (!user) return res.status(404).json({ success: false, error: 'user not found' });
    if (user?.privacy?.likesPublic === false) {
      return res.status(403).json({ success: false, error: 'likes are private' });
    }

    const state = await UserState.findOne({ userId: user._id }).lean();
    const likedSongs = state?.data?.likedSongs;

    return res.json({
      success: true,
      username: user.username,
      likes: Array.isArray(likedSongs) ? likedSongs : []
    });
  } catch (error) {
    console.error('Get user likes error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:username/playlists', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) return res.status(400).json({ success: false, error: 'username required' });

    const user = await User.findOne({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .select('_id username privacy')
      .lean();

    if (!user) return res.status(404).json({ success: false, error: 'user not found' });
    if (user?.privacy?.playlistsPublic === false) {
      return res.status(403).json({ success: false, error: 'playlists are private' });
    }

    const state = await UserState.findOne({ userId: user._id }).lean();
    const playlists = state?.data?.playlists;

    return res.json({
      success: true,
      username: user.username,
      playlists: Array.isArray(playlists) ? playlists : []
    });
  } catch (error) {
    console.error('Get user playlists error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
