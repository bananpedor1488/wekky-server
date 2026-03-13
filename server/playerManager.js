// Server-side player state manager
// Central source of truth for playback state, synced to all clients via WebSocket

const EventEmitter = require('events');

class PlayerManager extends EventEmitter {
  constructor() {
    super();
    
    // Core player state
    this.state = {
      currentTrack: null,
      isPlaying: false,
      progress: {
        current: 0,
        duration: 0,
        percentage: 0
      },
      queue: [],
      currentIndex: 0,
      shuffle: false,
      repeat: false,
      volume: 1
    };
    
    // Audio streaming reference (for server-side audio handling)
    this.audioStream = null;
    this.progressInterval = null;
    
    // WebSocket clients to broadcast to
    this.clients = new Set();
  }

  addClient(ws) {
    this.clients.add(ws);
    // Send current state to new client
    this.broadcastState(ws);
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  broadcastState(targetClient = null) {
    const message = JSON.stringify({
      type: 'playerState',
      state: this.state
    });

    if (targetClient && targetClient.readyState === 1) {
      targetClient.send(message);
    } else {
      this.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(message);
        }
      });
    }
  }

  broadcast(type, data) {
    const message = JSON.stringify({ type, ...data });
    this.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }

  // Play a track
  async playTrack(track, queue = null, index = 0) {
    this.state.currentTrack = track;
    this.state.isPlaying = true;
    this.state.progress = { current: 0, duration: track.duration || 0, percentage: 0 };
    
    if (queue) {
      this.state.queue = queue;
      this.state.currentIndex = index;
    }

    this.startProgressTracking();
    this.broadcastState();
    this.emit('trackChanged', track);
  }

  // Toggle play/pause
  togglePlay() {
    this.state.isPlaying = !this.state.isPlaying;
    
    if (this.state.isPlaying) {
      this.startProgressTracking();
    } else {
      this.stopProgressTracking();
    }
    
    this.broadcastState();
    this.emit(this.state.isPlaying ? 'play' : 'pause');
  }

  // Skip to next
  skipNext() {
    if (this.state.queue.length === 0) return;

    let nextIndex;
    if (this.state.shuffle) {
      nextIndex = Math.floor(Math.random() * this.state.queue.length);
    } else {
      nextIndex = (this.state.currentIndex + 1) % this.state.queue.length;
    }

    const nextTrack = this.state.queue[nextIndex];
    if (nextTrack) {
      this.playTrack(nextTrack, this.state.queue, nextIndex);
    }
  }

  // Skip to previous
  skipPrevious() {
    if (this.state.queue.length === 0) return;

    const prevIndex = this.state.currentIndex === 0 
      ? this.state.queue.length - 1 
      : this.state.currentIndex - 1;

    const prevTrack = this.state.queue[prevIndex];
    if (prevTrack) {
      this.playTrack(prevTrack, this.state.queue, prevIndex);
    }
  }

  // Seek to position
  seek(time) {
    if (!this.state.currentTrack) return;
    
    this.state.progress.current = time;
    this.state.progress.percentage = this.state.progress.duration > 0 
      ? (time / this.state.progress.duration) * 100 
      : 0;
    
    this.broadcastState();
  }

  // Toggle shuffle
  toggleShuffle() {
    this.state.shuffle = !this.state.shuffle;
    this.broadcastState();
  }

  // Toggle repeat
  toggleRepeat() {
    this.state.repeat = !this.state.repeat;
    this.broadcastState();
  }

  // Set volume
  setVolume(volume) {
    this.state.volume = Math.max(0, Math.min(1, volume));
    this.broadcastState();
  }

  // Add to queue
  addToQueue(track) {
    this.state.queue.push(track);
    this.broadcastState();
  }

  // Remove from queue
  removeFromQueue(index) {
    this.state.queue = this.state.queue.filter((_, i) => i !== index);
    if (index < this.state.currentIndex) {
      this.state.currentIndex--;
    }
    this.broadcastState();
  }

  // Clear queue
  clearQueue() {
    this.state.queue = [];
    this.state.currentIndex = 0;
    this.broadcastState();
  }

  // Start progress tracking
  startProgressTracking() {
    this.stopProgressTracking();
    
    this.progressInterval = setInterval(() => {
      if (!this.state.isPlaying || !this.state.currentTrack) return;
      
      this.state.progress.current += 1;
      
      if (this.state.progress.duration > 0) {
        this.state.progress.percentage = 
          (this.state.progress.current / this.state.progress.duration) * 100;
      }

      // Check if track ended
      if (this.state.progress.current >= this.state.progress.duration) {
        if (this.state.repeat) {
          this.state.progress.current = 0;
          this.state.progress.percentage = 0;
        } else {
          this.skipNext();
          return;
        }
      }

      this.broadcastState();
    }, 1000);
  }

  // Stop progress tracking
  stopProgressTracking() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  // Get audio stream URL for current track
  getAudioStreamUrl() {
    if (!this.state.currentTrack) return null;
    
    const track = this.state.currentTrack;
    
    // Return proxied stream URL
    if (track.type === 'soundcloud' && track.streamUrl) {
      return `/api/audio/stream/soundcloud/${track.id}`;
    } else if (track.type === 'youtube') {
      return `/api/audio/stream/youtube-mp3/${track.id}`;
    }
    
    return null;
  }

  // Get current state (for REST API)
  getState() {
    return {
      ...this.state,
      streamUrl: this.getAudioStreamUrl()
    };
  }
}

// Singleton instance
const playerManager = new PlayerManager();

module.exports = playerManager;
