const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { Readable } = require('stream');
const soundcloudProvider = require('../providers/soundcloudProvider');
let YTDlpWrapModule;
try {
  YTDlpWrapModule = require('yt-dlp-wrap');
} catch (e) {
  YTDlpWrapModule = null;
}

let ytDlp;
function getYtDlp() {
  if (ytDlp) return ytDlp;
  if (!YTDlpWrapModule) {
    throw new Error('yt-dlp-wrap module not available');
  }
  const YTDlpWrap = YTDlpWrapModule.default || YTDlpWrapModule;
  ytDlp = new YTDlpWrap();
  return ytDlp;
}

async function ytDlpExec(args, timeoutMs = 30000) {
  const inst = getYtDlp();
  const p = inst.execPromise(args);
  if (!timeoutMs) return p;
  return await Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error('yt-dlp timeout')), timeoutMs))
  ]);
}

function pipeFetchBodyToRes(audioResponse, res) {
  const body = audioResponse.body;
  if (!body) {
    res.end();
    return;
  }

  // Node >=18 fetch returns a Web ReadableStream
  if (typeof body.pipe === 'function') {
    body.pipe(res);
    return;
  }

  if (typeof Readable.fromWeb === 'function') {
    Readable.fromWeb(body).pipe(res);
    return;
  }

  res.end();
}

// Stream YouTube audio via yt-dlp proxy
router.get('/youtube/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const tryFormats = [
      'bestaudio[acodec^=mp4a][ext=m4a]/bestaudio[acodec^=mp4a][ext=mp4]/bestaudio[acodec^=mp4a]',
      'bestaudio'
    ];

    let audioUrl;
    let ext;
    let ytDlpError;

    for (const format of tryFormats) {
      try {
        const stdout = await ytDlpExec([
          '--no-playlist',
          '--quiet',
          '--no-warnings',
          '-f',
          format,
          '--print',
          '%(url)s',
          '--print',
          '%(ext)s',
          `https://youtube.com/watch?v=${id}`
        ], 30000);

        const lines = String(stdout || '')
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);

        audioUrl = lines.find(l => l.startsWith('http'));
        ext = (lines.find(l => !l.startsWith('http')) || '').toLowerCase();
        if (audioUrl) break;
      } catch (e) {
        ytDlpError = e;
      }
    }

    if (!audioUrl) {
      res.status(502);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`yt-dlp failed to get audio url${ytDlpError?.message ? `: ${ytDlpError.message}` : ''}`);
      return;
    }

    if (ext && !['m4a', 'mp4', 'webm'].includes(ext)) {
      return res.status(415).json({
        success: false,
        error: `Unsupported YouTube audio format: ${ext}`
      });
    }

    const range = req.headers.range;
    const headers = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': '*/*'
    };
    if (range) headers.Range = range;

    const audioResponse = await fetch(audioUrl, { headers });
    if (!audioResponse.ok && audioResponse.status !== 206) {
      return res.status(502).json({ success: false, error: 'Failed to fetch audio' });
    }

    let contentType = audioResponse.headers.get('content-type') || '';
    if (!contentType) {
      if (ext === 'webm') contentType = 'audio/webm';
      else contentType = 'audio/mp4';
    }
    const acceptRanges = audioResponse.headers.get('accept-ranges') || 'bytes';
    const contentLength = audioResponse.headers.get('content-length');
    const contentRange = audioResponse.headers.get('content-range');

    res.status(audioResponse.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    pipeFetchBodyToRes(audioResponse, res);
    
  } catch (error) {
    console.error('YouTube stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to get audio stream' });
  }
});

// Stream YouTube as MP3 (on-the-fly transcode via ffmpeg)
// Requires ffmpeg + yt-dlp installed on the server machine.
router.get('/youtube-mp3/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Use any bestaudio as input; ffmpeg outputs mp3
    const stdout = await ytDlpExec([
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      '-f',
      'bestaudio',
      '--get-url',
      `https://youtube.com/watch?v=${id}`
    ], 30000);

    const audioUrl = String(stdout || '').trim();
    if (!audioUrl) {
      res.status(404);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Audio URL not found');
      return;
    }

    res.status(200);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    // Range for mp3 transcoding is not supported (would require segmenting)
    res.setHeader('Accept-Ranges', 'none');

    const ff = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', audioUrl,
      '-vn',
      '-acodec', 'libmp3lame',
      '-b:a', '192k',
      '-f', 'mp3',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    ff.stdout.pipe(res);

    ff.on('error', (err) => {
      console.error('ffmpeg spawn error:', err);
      if (!res.headersSent) {
        res.status(500);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      if (!res.writableEnded) {
        res.end('Failed to transcode audio (ffmpeg not available)');
      }
    });

    ff.stderr.on('data', (d) => {
      console.log('[ffmpeg]', d.toString().slice(0, 300));
    });

    const cleanup = () => {
      try { ff.kill('SIGKILL'); } catch (e) {}
    };

    res.on('close', cleanup);
    res.on('error', cleanup);

    ff.on('close', (code) => {
      if (!res.writableEnded) res.end();
      if (code !== 0) {
        console.log('ffmpeg exited with code', code);
      }
    });
  } catch (error) {
    console.error('YouTube MP3 stream error:', error);
    res.status(500);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Failed to transcode audio (need ffmpeg + yt-dlp installed)');
  }
});

// Stream SoundCloud audio proxy
router.get('/soundcloud/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const streamData = await soundcloudProvider.getStreamUrl(id);
    if (!streamData?.url) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }

    const range = req.headers.range;
    const headers = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': '*/*'
    };
    if (range) headers.Range = range;

    // Proxy the stream through our server
    const audioResponse = await fetch(streamData.url, { headers });
    
    if (!audioResponse.ok) {
      return res.status(500).json({ success: false, error: 'Failed to fetch audio' });
    }

    const contentType = audioResponse.headers.get('content-type') || 'audio/mpeg';
    const acceptRanges = audioResponse.headers.get('accept-ranges') || 'bytes';
    const contentLength = audioResponse.headers.get('content-length');
    const contentRange = audioResponse.headers.get('content-range');

    res.status(audioResponse.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', acceptRanges);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    
    // Stream the audio
    pipeFetchBodyToRes(audioResponse, res);
    
  } catch (error) {
    console.error('SoundCloud stream error:', error);
    res.status(500).json({ success: false, error: 'Failed to stream audio' });
  }
});

// Get current track audio stream URL (from player state)
router.get('/current', async (req, res) => {
  const playerManager = require('../playerManager');
  const streamUrl = playerManager.getAudioStreamUrl();
  
  if (!streamUrl) {
    return res.status(404).json({ success: false, error: 'No track playing' });
  }
  
  res.json({
    success: true,
    streamUrl
  });
});

module.exports = router;
