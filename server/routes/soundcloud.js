const express = require('express');
const router = express.Router();
const soundcloudProvider = require('../providers/soundcloudProvider');

// Search SoundCloud tracks
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'tracks', limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await soundcloudProvider.search(q, type, parseInt(limit));
    res.json({ 
      success: true, 
      query: q,
      count: results.length,
      results 
    });
  } catch (error) {
    console.error('SoundCloud search route error:', error);
    const lastError = typeof soundcloudProvider.getLastError === 'function'
      ? soundcloudProvider.getLastError()
      : null;
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: error.message,
      details: lastError ? {
        status: lastError.status || null,
        message: lastError.message || null
      } : null
    });
  }
});

// Search SoundCloud users
router.get('/search/users', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await soundcloudProvider.searchUsers(q, parseInt(limit));
    res.json({ 
      success: true, 
      query: q,
      count: results.length,
      results 
    });
  } catch (error) {
    console.error('SoundCloud user search error:', error);
    res.status(500).json({ error: 'User search failed', message: error.message });
  }
});

// Get user tracks by ID or URL
router.get('/user/:identifier/tracks', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { limit = 50 } = req.query;
    
    // Support both numeric ID and username/URL
    const userId = decodeURIComponent(identifier);
    const results = await soundcloudProvider.getUserTracks(userId, parseInt(limit));
    
    res.json({ 
      success: true, 
      userId,
      count: results.length,
      results 
    });
  } catch (error) {
    console.error('SoundCloud user tracks error:', error);
    res.status(500).json({ error: 'Failed to get user tracks', message: error.message });
  }
});

// Get user playlists
router.get('/user/:id/playlists', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;
    
    const results = await soundcloudProvider.getUserPlaylists(id, parseInt(limit));
    res.json({ 
      success: true, 
      userId: id,
      count: results.length,
      results 
    });
  } catch (error) {
    console.error('SoundCloud user playlists error:', error);
    res.status(500).json({ error: 'Failed to get playlists', message: error.message });
  }
});

// Get trending tracks
router.get('/trending', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const results = await soundcloudProvider.getTrending(parseInt(limit));
    res.json({ 
      success: true, 
      count: results.length,
      results 
    });
  } catch (error) {
    console.error('SoundCloud trending error:', error);
    res.status(500).json({ error: 'Failed to get trending', message: error.message });
  }
});

// Get track details
router.get('/track/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const track = await soundcloudProvider.getTrack(id);
    
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    res.json({ success: true, track });
  } catch (error) {
    console.error('SoundCloud track details error:', error);
    res.status(500).json({ error: 'Failed to get track details', message: error.message });
  }
});

// Get stream URL for a track
router.get('/stream/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const streamData = await soundcloudProvider.getStreamUrl(id);
    res.json({ success: true, stream: streamData });
  } catch (error) {
    console.error('SoundCloud stream error:', error);
    res.status(500).json({ error: 'Failed to get stream URL', message: error.message });
  }
});

// Resolve a SoundCloud URL to get resource info
router.get('/resolve', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const resolvedId = await soundcloudProvider.resolveUserId(url);
    res.json({ success: true, resolvedId });
  } catch (error) {
    console.error('SoundCloud resolve error:', error);
    res.status(500).json({ error: 'Failed to resolve URL', message: error.message });
  }
});

module.exports = router;
