const express = require('express');
const User = require('../models/User');
const UserState = require('../models/UserState');
const { authRequired } = require('../middleware/authRequired');

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
    followersCount: Array.isArray(user.followers) ? user.followers.length : 0,
    followingCount: Array.isArray(user.following) ? user.following.length : 0,
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
      .select('_id username displayName bio avatarUrl avatarBase64 bannerBase64 followers following privacy')
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

router.get('/:username/follow-status', authRequired, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) return res.status(400).json({ success: false, error: 'username required' });

    const target = await User.findOne({
      username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    })
      .select('_id followers following')
      .lean();

    if (!target) return res.status(404).json({ success: false, error: 'user not found' });

    const meId = String(req.user.id);
    const isFollowing = Array.isArray(target.followers)
      ? target.followers.some((id) => String(id) === meId)
      : false;

    return res.json({
      success: true,
      isFollowing,
      followersCount: Array.isArray(target.followers) ? target.followers.length : 0,
      followingCount: Array.isArray(target.following) ? target.following.length : 0
    });
  } catch (error) {
    console.error('Follow status error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:username/follow', authRequired, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) return res.status(400).json({ success: false, error: 'username required' });

    const target = await User.findOne({
      username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    }).select('_id followers following');

    if (!target) return res.status(404).json({ success: false, error: 'user not found' });

    const meId = String(req.user.id);
    if (String(target._id) === meId) {
      return res.status(400).json({ success: false, error: 'cannot follow yourself' });
    }

    await Promise.all([
      User.updateOne({ _id: target._id }, { $addToSet: { followers: meId } }),
      User.updateOne({ _id: meId }, { $addToSet: { following: target._id } })
    ]);

    const updated = await User.findById(target._id).select('_id followers following').lean();

    return res.json({
      success: true,
      isFollowing: true,
      followersCount: Array.isArray(updated?.followers) ? updated.followers.length : 0,
      followingCount: Array.isArray(updated?.following) ? updated.following.length : 0
    });
  } catch (error) {
    console.error('Follow error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:username/follow', authRequired, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) return res.status(400).json({ success: false, error: 'username required' });

    const target = await User.findOne({
      username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    }).select('_id followers following');

    if (!target) return res.status(404).json({ success: false, error: 'user not found' });

    const meId = String(req.user.id);
    await Promise.all([
      User.updateOne({ _id: target._id }, { $pull: { followers: meId } }),
      User.updateOne({ _id: meId }, { $pull: { following: target._id } })
    ]);

    const updated = await User.findById(target._id).select('_id followers following').lean();

    return res.json({
      success: true,
      isFollowing: false,
      followersCount: Array.isArray(updated?.followers) ? updated.followers.length : 0,
      followingCount: Array.isArray(updated?.following) ? updated.following.length : 0
    });
  } catch (error) {
    console.error('Unfollow error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:username', async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    if (!username) return res.status(400).json({ success: false, error: 'username required' });

    const user = await User.findOne({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .select('_id username displayName bio avatarUrl avatarBase64 bannerBase64 followers following privacy')
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
