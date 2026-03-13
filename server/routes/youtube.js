const express = require('express');
const router = express.Router();
const youtubeProvider = require('../providers/youtubeProvider');

// Search YouTube Music
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'songs', limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const results = await youtubeProvider.search(q, type, parseInt(limit));
    res.json({ 
      success: true, 
      query: q,
      count: results.length,
      results 
    });
  } catch (error) {
    console.error('YouTube search route error:', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// Get trending tracks
router.get('/trending', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const results = await youtubeProvider.getTrending(parseInt(limit));
    res.json({ 
      success: true, 
      count: results.length,
      results 
    });
  } catch (error) {
    console.error('YouTube trending route error:', error);
    res.status(500).json({ error: 'Failed to get trending', message: error.message });
  }
});

// Get track details
router.get('/track/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const track = await youtubeProvider.getTrackDetails(id);
    
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    res.json({ success: true, track });
  } catch (error) {
    console.error('YouTube track details error:', error);
    res.status(500).json({ error: 'Failed to get track details', message: error.message });
  }
});

// Get audio stream URL
router.get('/stream/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const streamData = await youtubeProvider.getAudioStream(id);
    res.json({ success: true, stream: streamData });
  } catch (error) {
    console.error('YouTube stream error:', error);
    res.status(500).json({ error: 'Failed to get stream', message: error.message });
  }
});

module.exports = router;
