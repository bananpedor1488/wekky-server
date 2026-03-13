const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const os = require('os');
const soundcloudProvider = require('../providers/soundcloudProvider');
let YTDlpWrapModule;
try {
  YTDlpWrapModule = require('yt-dlp-wrap');
} catch (e) {
  YTDlpWrapModule = null;
}

let ytDlp;
let ytDlpReadyPromise;
let ytDlpBinaryPath;
let ytDlpCookiesPath;

function withTimeout(promise, timeoutMs, label) {
  if (!timeoutMs) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label || 'timeout'} after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

function ensureYtDlpCookiesFile() {
  if (ytDlpCookiesPath) return ytDlpCookiesPath;

  const raw = process.env.YTDLP_COOKIES;
  const b64 = process.env.YTDLP_COOKIES_BASE64;
  if (!raw && !b64) return null;

  let content = raw;
  if (!content && b64) {
    try {
      content = Buffer.from(b64, 'base64').toString('utf8');
    } catch (e) {
      content = null;
    }
  }
  if (!content) return null;

  const tmpDir = os.tmpdir();
  const p = path.join(tmpDir, 'yt-cookies.txt');
  try {
    fs.writeFileSync(p, content, { encoding: 'utf8', mode: 0o600 });
    ytDlpCookiesPath = p;
    console.log('[yt-dlp] cookies file written to', p);
    return p;
  } catch (e) {
    console.error('[yt-dlp] failed to write cookies file:', e?.message);
    return null;
  }
}

function injectCookiesArgs(args) {
  const cookiesPath = ensureYtDlpCookiesFile();
  if (!cookiesPath) return args;
  // Avoid duplicating cookies arg
  if (args.includes('--cookies')) return args;
  return ['--cookies', cookiesPath, ...args];
}

function injectDefaultYtDlpArgs(args) {
  // Avoid duplicating if caller already set them
  const out = [...args];
  if (!out.includes('--socket-timeout')) out.unshift('10', '--socket-timeout');
  if (!out.includes('--retries')) out.unshift('3', '--retries');
  if (!out.includes('--fragment-retries')) out.unshift('3', '--fragment-retries');
  if (!out.includes('--retry-sleep')) out.unshift('1', '--retry-sleep');
  return out;
}

function getYtDlp() {
  if (ytDlp) return ytDlp;
  if (!YTDlpWrapModule) {
    throw new Error('yt-dlp-wrap module not available');
  }
  const YTDlpWrap = YTDlpWrapModule.default || YTDlpWrapModule;
  ytDlp = new YTDlpWrap(ytDlpBinaryPath);
  return ytDlp;
}

async function ensureYtDlpReady() {
  if (ytDlpReadyPromise) {
    await ytDlpReadyPromise;
    return getYtDlp();
  }

  ytDlpReadyPromise = (async () => {
    try {
      if (!YTDlpWrapModule) {
        throw new Error('yt-dlp-wrap module not available');
      }

      const YTDlpWrap = YTDlpWrapModule.default || YTDlpWrapModule;
      const tmpDir = os.tmpdir();
      const target = path.join(tmpDir, 'yt-dlp');

      if (typeof YTDlpWrap.downloadFromGithub === 'function') {
        console.log('[yt-dlp] downloading binary to', target);
        await withTimeout(
          YTDlpWrap.downloadFromGithub(target),
          60000,
          'yt-dlp binary download'
        );
        console.log('[yt-dlp] binary ready');
      }

      ytDlpBinaryPath = target;
      // Recreate instance with explicit binary path so it won't spawn `yt-dlp` from PATH.
      ytDlp = new YTDlpWrap(ytDlpBinaryPath);
    } catch (e) {
      ytDlpReadyPromise = null;
      throw e;
    }
  })();

  await ytDlpReadyPromise;
  return getYtDlp();
}

async function ytDlpExec(args, timeoutMs = 30000) {
  const inst = await ensureYtDlpReady();
  const finalArgs = injectDefaultYtDlpArgs(injectCookiesArgs(args));
  const p = inst.execPromise(finalArgs);
  if (!timeoutMs) return p;
  return await Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error('yt-dlp timeout')), timeoutMs))
  ]);
}

async function ytDlpExecLogged(label, args, timeoutMs) {
  const start = Date.now();
  try {
    console.log('[yt-dlp]', label, 'start');
    const out = await ytDlpExec(args, timeoutMs);
    console.log('[yt-dlp]', label, 'ok', `${Date.now() - start}ms`);
    return out;
  } catch (e) {
    console.log('[yt-dlp]', label, 'fail', `${Date.now() - start}ms`, e?.message);
    throw e;
  }
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

function serveLocalFileWithRange(req, res, filePath, contentType) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (e) {
    res.status(404);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('File not found');
    return;
  }

  const total = stat.size;
  const range = req.headers.range;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType || 'application/octet-stream');

  if (!range) {
    res.status(200);
    res.setHeader('Content-Length', String(total));
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const m = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!m) {
    res.status(416);
    res.setHeader('Content-Range', `bytes */${total}`);
    res.end();
    return;
  }

  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : total - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
    res.status(416);
    res.setHeader('Content-Range', `bytes */${total}`);
    res.end();
    return;
  }

  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  res.setHeader('Content-Length', String(end - start + 1));
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (e) {}
}

function findDownloadedFile(tmpDir, id) {
  try {
    const prefix = `yt-${id}.`;
    const items = fs.readdirSync(tmpDir);
    const match = items.find((n) => n.startsWith(prefix));
    return match ? path.join(tmpDir, match) : null;
  } catch (e) {
    return null;
  }
}

// Stream YouTube audio via yt-dlp proxy
router.get('/youtube/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[youtube]', id, 'request start');
    
    const tryFormats = [
      'bestaudio[acodec^=mp4a][ext=m4a]/bestaudio[acodec^=mp4a][ext=mp4]/bestaudio[acodec^=mp4a]',
      'bestaudio'
    ];

    let audioUrl;
    let ext;
    let ytDlpError;

    for (const format of tryFormats) {
      try {
        const stdout = await ytDlpExecLogged(`probe-url:${format}`, [
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

    if (ytDlpError) {
      console.log('[youtube]', id, 'yt-dlp url probe error:', ytDlpError?.message);
    }

    const isExtSupported = !ext || ['m4a', 'mp4', 'webm'].includes(ext);

    if (audioUrl && isExtSupported) {
      try {
        const range = req.headers.range;
        const headers = {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': '*/*'
        };
        if (range) headers.Range = range;

        const audioResponse = await fetch(audioUrl, { headers });
        if (audioResponse.ok || audioResponse.status === 206) {
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
          return;
        }
        console.error('YouTube upstream fetch failed:', {
          id,
          status: audioResponse.status,
          range: req.headers.range
        });
      } catch (e) {
        console.error('YouTube upstream fetch error:', {
          id,
          message: e?.message
        });
      }
    }

    if (ext && !isExtSupported) {
      res.status(415);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`Unsupported YouTube audio format: ${ext}`);
      return;
    }

    const tmpDir = os.tmpdir();
    const outTpl = path.join(tmpDir, `yt-${id}.%(ext)s`);

    // If already downloaded, serve from cache
    let downloadedPath = findDownloadedFile(tmpDir, id);
    if (!downloadedPath) {
      // Cleanup possible stale target names
      safeUnlink(path.join(tmpDir, `yt-${id}.m4a`));
      safeUnlink(path.join(tmpDir, `yt-${id}.mp4`));
      safeUnlink(path.join(tmpDir, `yt-${id}.webm`));

      try {
        console.log('[youtube]', id, 'downloading mp4a format to', outTpl);
        await ytDlpExecLogged('download-mp4a', [
          '--no-playlist',
          '--quiet',
          '--no-warnings',
          '--no-part',
          '-f',
          tryFormats[0],
          '-o',
          outTpl,
          `https://youtube.com/watch?v=${id}`
        ], 120000);
      } catch (e1) {
        console.error('YouTube download mp4a format failed:', { id, message: e1?.message });
        try {
          console.log('[youtube]', id, 'downloading bestaudio to', outTpl);
          await ytDlpExecLogged('download-bestaudio', [
            '--no-playlist',
            '--quiet',
            '--no-warnings',
            '--no-part',
            '-f',
            tryFormats[1],
            '-o',
            outTpl,
            `https://youtube.com/watch?v=${id}`
          ], 120000);
        } catch (e2) {
          console.error('YouTube download bestaudio failed:', { id, message: e2?.message });
          const msg = String(e2?.message || e1?.message || 'unknown error');
          const isTimeout = msg.toLowerCase().includes('timeout');
          res.status(502);
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(`youtube stream failed (yt-dlp): ${msg}`);
          if (isTimeout) res.status(504);
          return;
        }
      }

      downloadedPath = findDownloadedFile(tmpDir, id);
    }

    if (!downloadedPath) {
      res.status(502);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('youtube stream failed: file not downloaded');
      return;
    }

    const downloadedExt = path.extname(downloadedPath).replace('.', '').toLowerCase();
    const contentType = downloadedExt === 'webm' ? 'audio/webm' : 'audio/mp4';
    console.log('[youtube]', id, 'serving local file', downloadedPath, 'as', contentType);
    serveLocalFileWithRange(req, res, downloadedPath, contentType);
    
  } catch (error) {
    console.error('YouTube stream error:', error);
    const msg = String(error?.message || 'Failed to get audio stream');
    const isTimeout = msg.toLowerCase().includes('timeout');
    res.status(isTimeout ? 504 : 500);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(msg);
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
