const axios = require('axios');
const cheerio = require('cheerio');

/**
 * YouTube Music Provider
 * Extracts music data from YouTube without API key using public pages
 */
class YouTubeProvider {
  constructor() {
    this.baseUrl = 'https://www.youtube.com';
    this.musicBaseUrl = 'https://music.youtube.com';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  /**
   * Search for tracks on YouTube Music
   * Uses the public search page and parses results
   */
  async search(query, type = 'songs', limit = 20) {
    try {
      // Use YouTube's search with music filter
      const searchUrl = `${this.baseUrl}/results?search_query=${encodeURIComponent(query + ' music')}&sp=EgIQAQ%253D%253D`;
      
      const response = await axios.get(searchUrl, {
        headers: this.headers,
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      // Parse initial data from ytInitialData script
      const html = response.data;
      const ytDataMatch = html.match(/var ytInitialData = (.+?);<\/script>/);
      
      if (ytDataMatch) {
        const ytData = JSON.parse(ytDataMatch[1]);
        const contents = this.extractContents(ytData);
        
        for (const item of contents.slice(0, limit)) {
          const track = this.parseTrackItem(item);
          if (track) {
            results.push(track);
          }
        }
      }

      // Fallback to HTML parsing if JSON extraction fails
      if (results.length === 0) {
        $('ytd-video-renderer, ytd-compact-video-renderer').each((i, elem) => {
          if (i >= limit) return false;
          
          const $elem = $(elem);
          const titleElem = $elem.find('#video-title, .ytd-video-meta-block');
          const title = titleElem.text().trim();
          const videoId = $elem.find('a').attr('href')?.match(/[?&]v=([^&]+)/)?.[1];
          const thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : '';
          const channel = $elem.find('#channel-name a, .ytd-channel-name a').text().trim();
          
          if (title && videoId) {
            results.push({
              id: videoId,
              title: this.cleanTitle(title),
              artist: channel || 'Unknown Artist',
              thumbnail,
              duration: this.extractDuration($elem),
              type: 'youtube',
              url: `https://youtube.com/watch?v=${videoId}`
            });
          }
        });
      }

      return results;
    } catch (error) {
      console.error('YouTube search error:', error.message);
      return [];
    }
  }

  /**
   * Extract video contents from ytInitialData
   */
  extractContents(ytData) {
    try {
      const contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents ||
                      ytData?.contents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
      return contents;
    } catch (e) {
      return [];
    }
  }

  /**
   * Parse a track item from YouTube data structure
   */
  parseTrackItem(item) {
    try {
      const videoRenderer = item.videoRenderer;
      if (!videoRenderer) return null;

      const videoId = videoRenderer.videoId;
      const title = videoRenderer.title?.runs?.[0]?.text || '';
      const channel = videoRenderer.ownerText?.runs?.[0]?.text || '';
      const thumbnail = videoRenderer.thumbnail?.thumbnails?.pop()?.url || '';
      const duration = videoRenderer.lengthText?.simpleText || '';

      if (!videoId || !title) return null;

      return {
        id: videoId,
        title: this.cleanTitle(title),
        artist: channel,
        thumbnail,
        duration: this.parseDuration(duration),
        durationText: duration,
        type: 'youtube',
        url: `https://youtube.com/watch?v=${videoId}`
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Get trending music tracks
   */
  async getTrending(limit = 20) {
    try {
      // YouTube Music's trending page
      const url = `${this.musicBaseUrl}/explore`;
      
      const response = await axios.get(url, {
        headers: {
          ...this.headers,
          'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+{}'.replace('{}', Math.floor(Math.random() * 100))
        },
        timeout: 10000
      });

      const html = response.data;
      const ytDataMatch = html.match(/var ytInitialData = (.+?);<\/script>/);
      
      const results = [];
      
      if (ytDataMatch) {
        const ytData = JSON.parse(ytDataMatch[1]);
        // Extract trending songs from the explore page
        const sections = ytData?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
        
        for (const section of sections) {
          const items = section.musicCarouselShelfRenderer?.contents || section.musicShelfRenderer?.contents || [];
          
          for (const item of items.slice(0, limit)) {
            const track = this.parseMusicTrack(item);
            if (track) {
              results.push(track);
            }
          }
        }
      }

      return results;
    } catch (error) {
      console.error('YouTube trending error:', error.message);
      return [];
    }
  }

  /**
   * Parse music track from YouTube Music structure
   */
  parseMusicTrack(item) {
    try {
      const renderer = item.musicResponsiveListItemRenderer || item.musicTwoRowItemRenderer;
      if (!renderer) return null;

      const videoId = renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
                     renderer?.navigationEndpoint?.watchEndpoint?.videoId;
      
      const title = renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text ||
                   renderer?.title?.runs?.[0]?.text || '';
      
      const artist = renderer?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text ||
                    renderer?.subtitle?.runs?.[0]?.text || '';
      
      const thumbnail = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url || '';

      if (!videoId || !title) return null;

      return {
        id: videoId,
        title: this.cleanTitle(title),
        artist,
        thumbnail,
        type: 'youtube',
        url: `https://music.youtube.com/watch?v=${videoId}`
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Get audio stream URL using ytdl-core
   */
  async getAudioStream(videoId) {
    try {
      // Return embed URL for iframe playback
      // This is the most reliable method without API keys
      return {
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`,
        videoId,
        type: 'embed'
      };
    } catch (error) {
      console.error('Stream error:', error.message);
      throw error;
    }
  }

  /**
   * Get track details by ID
   */
  async getTrackDetails(videoId) {
    try {
      const url = `${this.baseUrl}/watch?v=${videoId}`;
      const response = await axios.get(url, { headers: this.headers, timeout: 10000 });
      
      const html = response.data;
      
      // Extract title
      const titleMatch = html.match(/<meta name="title" content="([^"]+)">/) ||
                        html.match(/"title":"([^"]+)"/);
      const title = titleMatch ? titleMatch[1] : '';
      
      // Extract channel/artist
      const channelMatch = html.match(/"author":"([^"]+)"/) ||
                          html.match(/"channelName":"([^"]+)"/);
      const artist = channelMatch ? channelMatch[1] : 'Unknown Artist';
      
      // Extract thumbnail
      const thumbMatch = html.match(/"thumbnailUrl":"([^"]+)"/);
      const thumbnail = thumbMatch ? thumbMatch[1].replace(/\\/g, '') : 
                       `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

      return {
        id: videoId,
        title: this.cleanTitle(title),
        artist,
        thumbnail,
        type: 'youtube',
        url: `https://youtube.com/watch?v=${videoId}`
      };
    } catch (error) {
      console.error('Track details error:', error.message);
      return null;
    }
  }

  /**
   * Clean video title by removing common suffixes
   */
  cleanTitle(title) {
    return title
      .replace(/\s*\(Official\s*(Music\s*)?Video\)/gi, '')
      .replace(/\s*\(Official\s*Audio\)/gi, '')
      .replace(/\s*\(Lyrics?\)/gi, '')
      .replace(/\s*-\s*Audio\s*$/gi, '')
      .replace(/\s*\|\s*.*$/g, '')
      .trim();
  }

  /**
   * Parse duration string to seconds
   */
  parseDuration(duration) {
    if (!duration) return 0;
    const parts = duration.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  /**
   * Extract duration from HTML element
   */
  extractDuration($elem) {
    const durationText = $elem.find('.ytd-thumbnail-overlay-time-status-renderer, #text').text().trim();
    return this.parseDuration(durationText);
  }
}

module.exports = new YouTubeProvider();
