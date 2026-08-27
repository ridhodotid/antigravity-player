const EventEmitter = require('events');
const MetadataHelper = require('./metadataHelper');
const historyManager = require('./historyManager');

/**
 * StateManager
 * Keeps central player state synchronized with MPV and broadcasts real-time updates via WebSocket.
 */
class StateManager extends EventEmitter {
  constructor(mpvController, options = {}) {
    super();
    this.mpv = mpvController;
    this.pollInterval = options.pollInterval || 1000;
    this.pollTimer = null;
    this.lastRecordedTrackKey = '';

    this.state = {
      connected: false,
      paused: true,
      idle: true,
      rawTitle: '',
      title: 'Antigravity Player',
      artist: 'Ready to Play',
      thumbnail: null,
      currentUrl: '',
      duration: 0,
      timePos: 0,
      volume: 100,
      playlist: [],
      currentTrackIndex: -1,
      lastUpdated: Date.now(),
    };

    this._bindMpvEvents();
  }

  _bindMpvEvents() {
    this.mpv.on('connect', async () => {
      this.state.connected = true;
      this.emit('state_change', { type: 'CONNECTION_CHANGE', connected: true });
      await this.refreshFullState();
      this._startPolling();
    });

    this.mpv.on('disconnect', () => {
      this.state.connected = false;
      this.state.idle = true;
      this.state.paused = true;
      this._stopPolling();
      this.emit('state_change', { type: 'CONNECTION_CHANGE', connected: false });
    });

    this.mpv.on('property-change', ({ name, value }) => {
      this._handlePropertyChange(name, value);
    });

    this.mpv.on('event:end-file', () => {
      this.refreshFullState();
    });

    this.mpv.on('event:file-loaded', () => {
      this.refreshFullState();
    });

    this.mpv.on('event:playback-restart', () => {
      this.refreshFullState();
    });
  }

  _handlePropertyChange(name, value) {
    let changed = false;

    switch (name) {
      case 'pause':
        this.state.paused = !!value;
        changed = true;
        break;

      case 'idle-active':
        this.state.idle = !!value;
        changed = true;
        break;

      case 'volume':
        if (typeof value === 'number') {
          this.state.volume = Math.round(value);
          changed = true;
        }
        break;

      case 'time-pos':
        if (typeof value === 'number') {
          this.state.timePos = Math.round(value);
          changed = true;
        }
        break;

      case 'duration':
        if (typeof value === 'number') {
          this.state.duration = Math.round(value);
          changed = true;
        }
        break;

      case 'media-title':
      case 'track-list/0/title':
        if (typeof value === 'string' && value.trim()) {
          this.state.rawTitle = value;
          const { artist, title } = MetadataHelper.parseTitleAndArtist(value);
          this.state.artist = artist || 'YouTube / Stream';
          this.state.title = title || value;
          changed = true;
        }
        break;

      case 'path':
        if (typeof value === 'string') {
          this.state.currentUrl = value;
          const thumb = MetadataHelper.getYouTubeThumbnail(value);
          if (thumb) {
            this.state.thumbnail = thumb;
          }
          changed = true;
        }
        break;

      case 'playlist':
        if (Array.isArray(value)) {
          this.state.playlist = value.map((item, idx) => ({
            id: item.id || idx,
            filename: item.filename || '',
            title: item.title || item.filename || `Track ${idx + 1}`,
            current: !!item.current,
            playing: !!item.playing,
            thumbnail: MetadataHelper.getYouTubeThumbnail(item.filename),
          }));
          const currentIdx = this.state.playlist.findIndex((item) => item.current);
          this.state.currentTrackIndex = currentIdx;
          changed = true;
        }
        break;
    }

    if (changed) {
      this.state.lastUpdated = Date.now();
      this.emit('state_change', {
        type: 'PROPERTY_CHANGE',
        property: name,
        value,
        state: this.getState(),
      });
    }
  }

  /**
   * Fetch all properties from MPV and sync local state
   */
  async refreshFullState() {
    if (!this.mpv.isConnected) return;

    try {
      const [
        paused,
        idle,
        mediaTitle,
        path,
        duration,
        timePos,
        volume,
        playlist,
      ] = await Promise.allSettled([
        this.mpv.getProperty('pause'),
        this.mpv.getProperty('idle-active'),
        this.mpv.getProperty('media-title'),
        this.mpv.getProperty('path'),
        this.mpv.getProperty('duration'),
        this.mpv.getProperty('time-pos'),
        this.mpv.getProperty('volume'),
        this.mpv.getProperty('playlist'),
      ]);

      this.state.paused = paused.status === 'fulfilled' ? !!paused.value : false;
      this.state.idle = idle.status === 'fulfilled' ? !!idle.value : true;

      const currentPath = path.status === 'fulfilled' && typeof path.value === 'string' ? path.value : '';
      this.state.currentUrl = currentPath;
      this.state.thumbnail = MetadataHelper.getYouTubeThumbnail(currentPath);

      const rawTitle = mediaTitle.status === 'fulfilled' && typeof mediaTitle.value === 'string' ? mediaTitle.value : '';
      this.state.rawTitle = rawTitle;
      if (rawTitle) {
        const { artist, title } = MetadataHelper.parseTitleAndArtist(rawTitle);
        this.state.artist = artist || 'YouTube / Stream';
        this.state.title = title || rawTitle;
      } else if (this.state.idle) {
        this.state.title = 'Antigravity Player';
        this.state.artist = 'Ready to Play';
        this.state.thumbnail = null;
      }

      this.state.duration = duration.status === 'fulfilled' && typeof duration.value === 'number' ? Math.round(duration.value) : 0;
      this.state.timePos = timePos.status === 'fulfilled' && typeof timePos.value === 'number' ? Math.round(timePos.value) : 0;
      this.state.volume = volume.status === 'fulfilled' && typeof volume.value === 'number' ? Math.round(volume.value) : 100;

      if (playlist.status === 'fulfilled' && Array.isArray(playlist.value)) {
        this.state.playlist = playlist.value.map((item, idx) => ({
          id: item.id || idx,
          filename: item.filename || '',
          title: item.title || item.filename || `Track ${idx + 1}`,
          current: !!item.current,
          playing: !!item.playing,
          thumbnail: MetadataHelper.getYouTubeThumbnail(item.filename),
        }));
        this.state.currentTrackIndex = this.state.playlist.findIndex((item) => item.current);
      }

      this.state.lastUpdated = Date.now();
      this._checkAndRecordHistory();

      this.emit('state_change', {
        type: 'FULL_SYNC',
        state: this.getState(),
      });
    } catch (err) {
      console.error('[StateManager] Failed to refresh state:', err.message);
    }
  }

  _checkAndRecordHistory() {
    if (this.state.idle) return;

    const trackKey = (this.state.currentUrl || '') + '::' + (this.state.title || '');
    if (!trackKey.trim() || trackKey === '::' || this.state.title === 'Antigravity Player') return;

    if (this.lastRecordedTrackKey !== trackKey) {
      this.lastRecordedTrackKey = trackKey;
      historyManager.addHistory({
        url: this.state.currentUrl,
        title: this.state.title,
        artist: this.state.artist,
        thumbnail: this.state.thumbnail,
        duration: this.state.duration,
      });
    }
  }

  _startPolling() {
    this._stopPolling();
    this.pollTimer = setInterval(async () => {
      if (!this.mpv.isConnected || this.state.idle || this.state.paused) {
        return;
      }

      try {
        const timePos = await this.mpv.getTimePos();
        if (typeof timePos === 'number') {
          const rounded = Math.round(timePos);
          if (rounded !== this.state.timePos) {
            this.state.timePos = rounded;
            this.emit('state_change', {
              type: 'TIME_UPDATE',
              timePos: rounded,
              duration: this.state.duration,
            });
          }
        }
      } catch {
        // Silently ignore individual poll drops
      }
    }, this.pollInterval);
  }

  _stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getState() {
    return { ...this.state };
  }

  destroy() {
    this._stopPolling();
  }
}

module.exports = StateManager;
