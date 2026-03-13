# iOS Music Player

A modern web music player inspired by iOS Apple Music design, built with **React + JSX** frontend and **Node.js + Express** backend.

![iOS Music Player](https://img.shields.io/badge/iOS%20Style-Music%20Player-pink)
![React](https://img.shields.io/badge/React-18-blue)
![Node.js](https://img.shields.io/badge/Node.js-18-green)

## Features

### Core Player Features
- 🎵 Play/Pause/Next/Previous controls
- 🔀 Shuffle and Repeat modes
- 📊 Progress bar with scrubbing
- 🔊 Volume control
- 📝 Playback queue
- 📱 Background playback support

### Music Sources (No API Key Required)
- **YouTube Music** - Search and stream via embed
- **SoundCloud** - Search tracks, load user playlists

### iOS-Style UI
- 🎨 Glassmorphism design with blurred backgrounds
- 🌓 Dark/Light mode support
- ✨ Smooth animations and transitions
- 📱 Mobile-first responsive design
- 🎯 Bottom mini-player
- 🔍 Full-screen Now Playing view

### Library Management
- 💜 Like/unlike songs
- 📁 Create and manage playlists
- ⏰ Recently played history
- 💾 IndexedDB local storage

## Tech Stack

### Backend
- Node.js
- Express.js
- Axios (HTTP requests)
- Cheerio (HTML parsing)
- WebSocket (real-time sync)

### Frontend
- React 18
- JSX Components
- CSS3 (CSS Variables, Grid, Flexbox)
- HTML5 Audio API
- IndexedDB (idb library)

## Project Structure

```
/ios-music-player
├── server/
│   ├── server.js              # Main server entry
│   ├── routes/
│   │   ├── youtube.js         # YouTube Music API routes
│   │   ├── soundcloud.js      # SoundCloud API routes
│   │   └── search.js          # Global search
│   └── providers/
│       ├── youtubeProvider.js # YouTube scraper
│       └── soundcloudProvider.js # SoundCloud API wrapper
├── client/
│   ├── src/
│   │   ├── App.jsx            # Main app component
│   │   ├── index.js           # React entry
│   │   ├── index.css          # Global styles
│   │   ├── components/        # React components
│   │   │   ├── TabBar.jsx
│   │   │   ├── MiniPlayer.jsx
│   │   │   ├── NowPlaying.jsx
│   │   │   └── TrackCard.jsx
│   │   ├── pages/             # Page components
│   │   │   ├── Home.jsx
│   │   │   ├── Search.jsx
│   │   │   └── Library.jsx
│   │   └── context/           # React Context
│   │       ├── PlayerContext.js
│   │       ├── LibraryContext.js
│   │       └── ThemeContext.js
│   └── public/
│       └── index.html
├── package.json
└── README.md
```

## Installation & Setup

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### 1. Clone and Install Dependencies

```bash
# Navigate to project directory
cd ios-music-player

# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### 2. Start the Application

**Development mode** (runs both server and client):
```bash
npm run dev
```

**Or run separately:**

Terminal 1 - Server:
```bash
npm run server
```

Terminal 2 - Client:
```bash
cd client
npm start
```

### 3. Open in Browser

Navigate to: http://localhost:3000

The app will automatically open in your default browser.

## Usage

### Search for Music
1. Tap the **Search** tab
2. Enter a song, artist, or album name
3. Select source filter (All, YouTube, SoundCloud)
4. Tap any track to play

### Create Playlists
1. Go to **Library** tab
2. Tap "Create Playlist"
3. Name your playlist
4. Add tracks from search results

### Like Songs
- Tap the heart icon on any track card
- View liked songs in Library > Liked Songs

### Now Playing
- Tap the mini-player at the bottom to expand
- View full-screen player with artwork
- Access queue and controls

## API Endpoints

### YouTube Music
- `GET /api/youtube/search?q={query}` - Search tracks
- `GET /api/youtube/trending` - Get trending
- `GET /api/youtube/track/:id` - Track details
- `GET /api/youtube/stream/:id` - Stream URL

### SoundCloud
- `GET /api/soundcloud/search?q={query}` - Search tracks
- `GET /api/soundcloud/user/:id/tracks` - User tracks
- `GET /api/soundcloud/track/:id` - Track details
- `GET /api/soundcloud/stream/:id` - Stream URL

### Global Search
- `GET /api/search?q={query}&sources=all` - Search all sources

## Customization

### Change Default Port
Edit `server/server.js`:
```javascript
const PORT = process.env.PORT || 3001;
```

### Modify Theme Colors
Edit `client/src/index.css` CSS variables:
```css
:root {
  --primary-color: #ff2d55;
  --accent-pink: #ff375f;
  --accent-purple: #af52de;
  /* ... */
}
```

## Troubleshooting

### SoundCloud streams not working
- Client ID extraction may fail occasionally
- The app uses a fallback client ID
- Try refreshing the page if streams fail

### YouTube playback issues
- YouTube embed requires user interaction
- Some videos may be restricted
- Try different tracks if one fails

### CORS errors
- The backend includes CORS middleware
- Ensure both server and client are running
- Check that ports match (default: 3000 client, 3001 server)

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- iOS Safari 14+
- Chrome Android 90+

## License

MIT License - feel free to use and modify!

## Contributing

Pull requests welcome! Please follow the existing code style.

---

**Made with ❤️ and 🎵**
