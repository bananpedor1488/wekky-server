const axios = require('axios');
const cheerio = require('cheerio');

/**
 * SoundCloud Provider
 * Extracts music data from SoundCloud without API key using public pages
 */
class SoundCloudProvider {
  constructor() {
    this.baseUrl = 'https://soundcloud.com';
    this.apiBaseUrl = 'https://api-v2.soundcloud.com';
    this.clientId = null;
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://soundcloud.com/',
    };
  }

  /**
   * Get or refresh client ID from SoundCloud
   */
  async getClientId() {
    if (this.clientId) return this.clientId;
    
    try {
      // Fetch the main page to get scripts containing client ID
      const response = await axios.get(this.baseUrl, {
        headers: this.headers,
        timeout: 10000
      });

      const html = response.data;
      
      // Look for client ID in script tags
      const scriptMatch = html.match(/<script[^>]*src="([^"]*assets[^"]*\.js)"[^>]*>/g);
      
      if (scriptMatch) {
        for (const script of scriptMatch) {
          const srcMatch = script.match(/src="([^"]+)"/);
          if (srcMatch) {
            const scriptUrl = srcMatch[1].startsWith('http') ? srcMatch[1] : `https:${srcMatch[1]}`;
            try {
              const scriptResponse = await axios.get(scriptUrl, { timeout: 10000 });
              const clientIdMatch = scriptResponse.data.match(/client_id[=:]"?([a-zA-Z0-9]+)"?/);
              if (clientIdMatch) {
                this.clientId = clientIdMatch[1];
                return this.clientId;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }

      // Fallback: try to find client_id in the initial HTML
      const inlineMatch = html.match(/client_id[=:]"?([a-zA-Z0-9]{32})"?/);
      if (inlineMatch) {
        this.clientId = inlineMatch[1];
        return this.clientId;
      }

      throw new Error('Could not extract client ID');
    } catch (error) {
      console.error('Client ID error:', error.message);
      // Use a fallback client ID that often works
      this.clientId = 'iZIs9mchVcX5lhVRyQGGAYlNpVImz0XA';
      return this.clientId;
    }
  }

  /**
   * Search for tracks on SoundCloud
   */
  async search(query, type = 'tracks', limit = 20) {
    try {
      const clientId = await this.getClientId();
      
      const searchUrl = `${this.apiBaseUrl}/search/${type}`;
      const params = {
        q: query,
        limit,
        offset: 0,
        client_id: clientId
      };

      const response = await axios.get(searchUrl, {
        headers: this.headers,
        params,
        timeout: 10000
      });

      const results = [];
      const collection = response.data?.collection || [];

      for (const item of collection.slice(0, limit)) {
        const track = this.parseTrack(item);
        if (track) {
          results.push(track);
        }
      }

      return results;
    } catch (error) {
      console.error('SoundCloud search error:', error.message);
      return [];
    }
  }

  /**
   * Get tracks from a SoundCloud user by ID or username
   */
  async getUserTracks(userIdOrUrl, limit = 50) {
    try {
      let userId = userIdOrUrl;
      
      // If URL provided, extract user ID
      if (userIdOrUrl.includes('soundcloud.com')) {
        userId = await this.resolveUserId(userIdOrUrl);
      }

      if (!userId) {
        throw new Error('Could not resolve user ID');
      }

      const clientId = await this.getClientId();
      
      const tracksUrl = `${this.apiBaseUrl}/users/${userId}/tracks`;
      const params = {
        limit,
        offset: 0,
        client_id: clientId
      };

      const response = await axios.get(tracksUrl, {
        headers: this.headers,
        params,
        timeout: 10000
      });

      const results = [];
      const collection = response.data?.collection || [];

      for (const item of collection) {
        const track = this.parseTrack(item);
        if (track) {
          results.push(track);
        }
      }

      return results;
    } catch (error) {
      console.error('User tracks error:', error.message);
      return [];
    }
  }

  /**
   * Resolve a SoundCloud URL to get the resource ID
   */
  async resolveUserId(url) {
    try {
      const clientId = await this.getClientId();
      const resolveUrl = `${this.apiBaseUrl}/resolve`;
      
      const response = await axios.get(resolveUrl, {
        headers: this.headers,
        params: {
          url,
          client_id: clientId
        },
        timeout: 10000
      });

      return response.data?.id;
    } catch (error) {
      console.error('Resolve error:', error.message);
      return null;
    }
  }

  /**
   * Get track details by ID
   */
  async getTrack(trackId) {
    try {
      const clientId = await this.getClientId();
      
      const trackUrl = `${this.apiBaseUrl}/tracks/${trackId}`;
      const response = await axios.get(trackUrl, {
        headers: this.headers,
        params: { client_id: clientId },
        timeout: 10000
      });

      return this.parseTrack(response.data);
    } catch (error) {
      console.error('Track details error:', error.message);
      return null;
    }
  }

  /**
   * Get streaming URL for a track
   */
  async getStreamUrl(trackId) {
    try {
      const clientId = await this.getClientId();
      
      // First get the track details to get the transcoding
      const track = await this.getTrack(trackId);
      if (!track || !track.streamUrl) {
        throw new Error('No stream URL available');
      }

      // Get the actual streaming URL
      const response = await axios.get(track.streamUrl, {
        headers: this.headers,
        params: { client_id: clientId },
        timeout: 10000,
        maxRedirects: 5
      });

      return {
        url: response.data?.url || response.request?.res?.responseUrl,
        trackId,
        type: 'soundcloud'
      };
    } catch (error) {
      console.error('Stream URL error:', error.message);
      
      // Fallback: return the progressive mp3 URL format
      const clientId = await this.getClientId();
      return {
        url: `https://api-v2.soundcloud.com/tracks/${trackId}/streams?client_id=${clientId}`,
        trackId,
        type: 'soundcloud',
        format: 'api'
      };
    }
  }

  /**
   * Get playlists from a user
   */
  async getUserPlaylists(userId, limit = 20) {
    try {
      const clientId = await this.getClientId();
      
      const url = `${this.apiBaseUrl}/users/${userId}/playlists`;
      const response = await axios.get(url, {
        headers: this.headers,
        params: {
          limit,
          offset: 0,
          client_id: clientId
        },
        timeout: 10000
      });

      const results = [];
      const collection = response.data?.collection || [];

      for (const item of collection) {
        const playlist = this.parsePlaylist(item);
        if (playlist) {
          results.push(playlist);
        }
      }

      return results;
    } catch (error) {
      console.error('User playlists error:', error.message);
      return [];
    }
  }

  /**
   * Get trending/popular tracks
   */
  async getTrending(limit = 20) {
    try {
      const clientId = await this.getClientId();
      
      const url = `${this.apiBaseUrl}/charts`;
      const response = await axios.get(url, {
        headers: this.headers,
        params: {
          kind: 'top',
          genre: 'all-music',
          limit,
          client_id: clientId
        },
        timeout: 10000
      });

      const results = [];
      const collection = response.data?.collection || [];

      for (const item of collection) {
        const track = this.parseTrack(item.track || item);
        if (track) {
          results.push(track);
        }
      }

      return results;
    } catch (error) {
      console.error('Trending error:', error.message);
      return [];
    }
  }

  /**
   * Parse track data from SoundCloud API response
   */
  parseTrack(item) {
    if (!item) return null;

    const artwork = item.artwork_url || item.user?.avatar_url;
    
    return {
      id: item.id?.toString(),
      title: item.title || 'Unknown Title',
      artist: item.user?.username || 'Unknown Artist',
      artistId: item.user?.id?.toString(),
      artistUrl: item.user?.permalink_url,
      thumbnail: artwork ? artwork.replace('large', 't500x500') : '',
      artwork: artwork ? artwork.replace('large', 't500x500') : '',
      duration: Math.floor((item.duration || 0) / 1000),
      durationText: this.formatDuration(item.duration),
      genre: item.genre || '',
      permalink: item.permalink,
      permalinkUrl: item.permalink_url,
      streamUrl: item.media?.transcodings?.find(t => t.format?.protocol === 'progressive')?.url || 
                item.media?.transcodings?.[0]?.url,
      waveformUrl: item.waveform_url,
      playbackCount: item.playback_count,
      likesCount: item.likes_count,
      type: 'soundcloud',
      url: item.permalink_url
    };
  }

  /**
   * Parse playlist data
   */
  parsePlaylist(item) {
    if (!item) return null;

    const artwork = item.artwork_url || item.tracks?.[0]?.artwork_url;

    return {
      id: item.id?.toString(),
      title: item.title || 'Unknown Playlist',
      description: item.description || '',
      thumbnail: artwork ? artwork.replace('large', 't500x500') : '',
      trackCount: item.track_count || 0,
      tracks: item.tracks?.map(t => this.parseTrack(t)).filter(Boolean) || [],
      permalinkUrl: item.permalink_url,
      type: 'soundcloud-playlist',
      url: item.permalink_url
    };
  }

  /**
   * Format duration in milliseconds to MM:SS
   */
  formatDuration(ms) {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Search for users
   */
  async searchUsers(query, limit = 10) {
    try {
      const clientId = await this.getClientId();
      
      const url = `${this.apiBaseUrl}/search/users`;
      const response = await axios.get(url, {
        headers: this.headers,
        params: {
          q: query,
          limit,
          client_id: clientId
        },
        timeout: 10000
      });

      return (response.data?.collection || []).map(user => ({
        id: user.id?.toString(),
        username: user.username,
        permalink: user.permalink,
        avatar: user.avatar_url?.replace('large', 't500x500'),
        followers: user.followers_count,
        trackCount: user.track_count,
        type: 'soundcloud-user'
      }));
    } catch (error) {
      console.error('User search error:', error.message);
      return [];
    }
  }
}

module.exports = new SoundCloudProvider();
