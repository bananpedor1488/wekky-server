const express = require('express');
const router = express.Router();
const playerManager = require('../playerManager');

// Get current player state
router.get('/state', (req, res) => {
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Play a track
router.post('/play', async (req, res) => {
  try {
    const { track, queue, index } = req.body;
    
    if (!track) {
      return res.status(400).json({ success: false, error: 'Track required' });
    }

    await playerManager.playTrack(track, queue || [track], index || 0);
    
    res.json({
      success: true,
      state: playerManager.getState()
    });
  } catch (error) {
    console.error('Play error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle play/pause
router.post('/toggle', (req, res) => {
  playerManager.togglePlay();
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Play
router.post('/resume', (req, res) => {
  if (!playerManager.state.isPlaying) {
    playerManager.togglePlay();
  }
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Pause
router.post('/pause', (req, res) => {
  if (playerManager.state.isPlaying) {
    playerManager.togglePlay();
  }
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Skip next
router.post('/next', (req, res) => {
  playerManager.skipNext();
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Skip previous
router.post('/previous', (req, res) => {
  playerManager.skipPrevious();
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Seek
router.post('/seek', (req, res) => {
  const { time } = req.body;
  
  if (typeof time !== 'number') {
    return res.status(400).json({ success: false, error: 'Time required' });
  }

  playerManager.seek(time);
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Toggle shuffle
router.post('/shuffle', (req, res) => {
  playerManager.toggleShuffle();
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Toggle repeat
router.post('/repeat', (req, res) => {
  playerManager.toggleRepeat();
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Set volume
router.post('/volume', (req, res) => {
  const { volume } = req.body;
  
  if (typeof volume !== 'number') {
    return res.status(400).json({ success: false, error: 'Volume required' });
  }

  playerManager.setVolume(volume);
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Add to queue
router.post('/queue/add', (req, res) => {
  const { track } = req.body;
  
  if (!track) {
    return res.status(400).json({ success: false, error: 'Track required' });
  }

  playerManager.addToQueue(track);
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Remove from queue
router.post('/queue/remove', (req, res) => {
  const { index } = req.body;
  
  if (typeof index !== 'number') {
    return res.status(400).json({ success: false, error: 'Index required' });
  }

  playerManager.removeFromQueue(index);
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Clear queue
router.post('/queue/clear', (req, res) => {
  playerManager.clearQueue();
  res.json({
    success: true,
    state: playerManager.getState()
  });
});

// Get queue
router.get('/queue', (req, res) => {
  res.json({
    success: true,
    queue: playerManager.state.queue,
    currentIndex: playerManager.state.currentIndex
  });
});

module.exports = router;
