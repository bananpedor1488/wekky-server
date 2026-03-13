# Music Player Server - Render Deployment

## Deployment on Render.com

### Prerequisites
- Render.com account (free tier works)
- GitHub repo with this code

### Steps

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Create New Service on Render**
   - Go to dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repo
   - Choose "Docker" as environment
   - Set:
     - **Name**: `music-player-server`
     - **Region**: Closest to you
     - **Branch**: `main`
     - **Root Directory**: `./` (or `server/` if repo has both)
   - Click "Create Web Service"

3. **Environment Variables (if needed)**
   In Render dashboard → Settings → Environment:
   - `PORT=10000` (Render sets this automatically)
   - `NODE_ENV=production`

4. **Verify ffmpeg/yt-dlp**
   After deploy, check logs - should show:
   - `ffmpeg version ...`
   - `yt-dlp` working

5. **Get URL**
   - Service URL will be like: `https://music-player-server-xxx.onrender.com`
   - Update `client/src/context/PlayerContext.js`:
     ```js
     const WS_URL = 'wss://music-player-server-xxx.onrender.com';
     const API_BASE = 'https://music-player-server-xxx.onrender.com';
     ```

### Local Development (with ffmpeg)

**Windows:**
1. Install ffmpeg: https://ffmpeg.org/download.html
2. Add to PATH
3. Install yt-dlp: `pip install yt-dlp`
4. `npm install && npm start`

**Mac:**
```bash
brew install ffmpeg yt-dlp
npm install && npm start
```

**Linux:**
```bash
sudo apt install ffmpeg
pip3 install yt-dlp
npm install && npm start
```

### Features
- ✅ YouTube → MP3 transcoding on-the-fly
- ✅ WebSocket real-time sync
- ✅ REST API for player control
- ✅ SoundCloud streaming
- ✅ Lyrics API
- ✅ CORS enabled for mobile

### Troubleshooting

**Mobile "Format error"**
- Check that ffmpeg is installed: `ffmpeg -version`
- Check yt-dlp: `yt-dlp --version`
- Verify endpoint returns `audio/mpeg`: test `/api/audio/stream/youtube-mp3/<id>`

**WebSocket not connecting**
- Use `wss://` (not `ws://`) for HTTPS
- Check firewall/Render URL is correct

**Build fails on Render**
- Ensure Dockerfile is in root
- Check logs for ffmpeg install errors
