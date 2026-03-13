const express = require('express');
const router = express.Router();

// Get lyrics for a track
router.get('/:artist/:title', async (req, res) => {
  try {
    const { artist, title } = req.params;
    const decodedArtist = decodeURIComponent(artist);
    const decodedTitle = decodeURIComponent(title);
    
    console.log(`[Lyrics] Searching for: "${decodedArtist}" - "${decodedTitle}"`);
    
    // Try 1: lrclib.net (synced lyrics)
    try {
      const lrclibUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(decodedArtist + ' ' + decodedTitle)}`;
      console.log(`[Lyrics] Trying lrclib: ${lrclibUrl}`);
      
      const lrclibResponse = await fetch(lrclibUrl);
      if (lrclibResponse.ok) {
        const data = await lrclibResponse.json();
        if (data && data.length > 0) {
          const track = data.find(t => t.syncedLyrics) || data[0];
          console.log(`[Lyrics] Found in lrclib: ${track.trackName}`);
          return res.json({
            success: true,
            lyrics: track.plainLyrics || track.syncedLyrics,
            synced: !!track.syncedLyrics,
            syncedLyrics: track.syncedLyrics,
            source: 'lrclib'
          });
        }
      }
    } catch (e) {
      console.log('[Lyrics] lrclib failed:', e.message);
    }
    
    // Try 2: lyrics.ovh
    try {
      const lyricsUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(decodedArtist)}/${encodeURIComponent(decodedTitle)}`;
      console.log(`[Lyrics] Trying lyricsovh: ${lyricsUrl}`);
      
      const lyricsResponse = await fetch(lyricsUrl);
      if (lyricsResponse.ok) {
        const data = await lyricsResponse.json();
        if (data.lyrics && data.lyrics.trim().length > 0) {
          console.log(`[Lyrics] Found in lyricsovh`);
          return res.json({
            success: true,
            lyrics: data.lyrics,
            synced: false,
            source: 'lyricsovh'
          });
        }
      }
    } catch (e) {
      console.log('[Lyrics] lyricsovh failed:', e.message);
    }
    
    // Try 3: Search by title only (without artist) in lrclib
    try {
      const titleOnlyUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(decodedTitle)}`;
      console.log(`[Lyrics] Trying lrclib title-only: ${titleOnlyUrl}`);
      
      const response = await fetch(titleOnlyUrl);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const track = data[0];
          console.log(`[Lyrics] Found in lrclib (title-only): ${track.trackName} by ${track.artistName}`);
          return res.json({
            success: true,
            lyrics: track.plainLyrics || track.syncedLyrics,
            synced: !!track.syncedLyrics,
            syncedLyrics: track.syncedLyrics,
            source: 'lrclib-title'
          });
        }
      }
    } catch (e) {
      console.log('[Lyrics] lrclib title-only failed:', e.message);
    }
    
    console.log(`[Lyrics] Not found: "${decodedArtist}" - "${decodedTitle}"`);
    return res.status(404).json({
      success: false,
      error: 'Lyrics not found'
    });
  } catch (error) {
    console.error('Lyrics API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lyrics'
    });
  }
});

module.exports = router;
