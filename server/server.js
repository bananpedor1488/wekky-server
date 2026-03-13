const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Routes
const youtubeRoutes = require('./routes/youtube');
const soundcloudRoutes = require('./routes/soundcloud');
const searchRoutes = require('./routes/search');
const playerRoutes = require('./routes/player');
const audioRoutes = require('./routes/audio');
const lyricsRoutes = require('./routes/lyrics');

app.use('/api/youtube', youtubeRoutes);
app.use('/api/soundcloud', soundcloudRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/audio/stream', audioRoutes);
app.use('/api/lyrics', lyricsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the main HTML file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server for real-time player state
const wss = new WebSocket.Server({ server });

// Import player manager
const playerManager = require('./playerManager');

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  
  // Add client to player manager
  playerManager.addClient(ws);

  // Handle player control messages from clients
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle player commands from clients
      if (data.type === 'playerCommand') {
        handlePlayerCommand(data.action, data.payload);
      }
      
      // Handle sync requests
      if (data.type === 'sync') {
        playerManager.broadcastState(ws);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    playerManager.removeClient(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    playerManager.removeClient(ws);
  });
});

// Handle player commands
function handlePlayerCommand(action, payload) {
  switch (action) {
    case 'play':
      playerManager.togglePlay();
      break;
    case 'pause':
      if (playerManager.state.isPlaying) playerManager.togglePlay();
      break;
    case 'resume':
      if (!playerManager.state.isPlaying) playerManager.togglePlay();
      break;
    case 'next':
      playerManager.skipNext();
      break;
    case 'previous':
      playerManager.skipPrevious();
      break;
    case 'seek':
      if (payload && payload.time !== undefined) playerManager.seek(payload.time);
      break;
    case 'shuffle':
      playerManager.toggleShuffle();
      break;
    case 'repeat':
      playerManager.toggleRepeat();
      break;
    case 'volume':
      if (payload && payload.volume !== undefined) playerManager.setVolume(payload.volume);
      break;
    case 'playTrack':
      if (payload && payload.track) {
        playerManager.playTrack(payload.track, payload.queue, payload.index);
      }
      break;
    default:
      console.log('Unknown player command:', action);
  }
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 iOS Music Player Server running on http://localhost:${PORT}`);
  console.log(`📱 API available at http://localhost:${PORT}/api`);
});

module.exports = { app, server, wss };
