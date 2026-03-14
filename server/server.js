const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://weeky-six.vercel.app'
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Allow LAN dev (e.g. http://192.168.0.10:3000)
  if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)\d{1,3}\.\d{1,3}:3000$/.test(origin)) {
    return true;
  }
  return false;
}

app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  optionsSuccessStatus: 204
}));
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

const clientDir = path.join(__dirname, '../client');
const clientIndexFile = path.join(clientDir, 'index.html');
const hasClient = fs.existsSync(clientDir) && fs.existsSync(clientIndexFile);

if (hasClient) {
  app.use(express.static(clientDir));
}

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

app.get('/api', (req, res) => {
  res.json({
    status: 'ok',
    service: 'music-player-server',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      youtube: '/api/youtube',
      soundcloud: '/api/soundcloud',
      search: '/api/search',
      player: '/api/player',
      audioStream: '/api/audio/stream',
      lyrics: '/api/lyrics'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the main HTML file
if (hasClient) {
  app.get('*', (req, res) => {
    res.sendFile(clientIndexFile);
  });
}

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
  const externalUrl = process.env.RENDER_EXTERNAL_URL;
  const baseUrl = externalUrl || `http://localhost:${PORT}`;
  console.log(`🎵 iOS Music Player Server running on ${baseUrl}`);
  console.log(`📱 API available at ${baseUrl}/api`);
});

module.exports = { app, server, wss };
