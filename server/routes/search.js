const express = require('express');
const router = express.Router();
const soundcloudProvider = require('../providers/soundcloudProvider');

// SoundCloud-only search
router.get('/', async (req, res) => {
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
    console.error('Global search error:', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// Quick search suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    const soundcloudResults = await soundcloudProvider.search(q, 'tracks', parseInt(limit)).catch(() => []);

    const suggestions = soundcloudResults.slice(0, limit).map(t => ({
      text: `${t.title} - ${t.artist}`,
      type: 'track',
      source: 'soundcloud',
      id: t.id
    }));

    res.json({ success: true, suggestions });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.json({ success: true, suggestions: [] });
  }
});

module.exports = router;
