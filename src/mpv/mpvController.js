const EventEmitter = require('events');
const MpvIpcClient = require('./mpvIpcClient');

/**
 * MpvController
 * High-level abstraction for MPV audio playback, volume, seeking, and queue management.
 */
class MpvController extends EventEmitter {
  constructor(socketPath, options = {}) {
    super();
    this.client = new MpvIpcClient(socketPath, options);
    this.observedProperties = new Map(); // id -> name
    this.observerCounter = 1;

    this._setupEventForwarding();
  }

  _setupEventForwarding() {
    this.client.on('connect', () => this.emit('connect'));
    this.client.on('disconnect', () => this.emit('disconnect'));
    this.client.on('socket_error', (err) => this.emit('socket_error', err));
    this.client.on('event', (evt) => this.emit('event', evt));
    this.client.on('property-change', (name, value, id) => {
      this.emit('property-change', { name, value, id });
    });
  }

  start() {
    this.client.connect();
  }

  get isConnected() {
    return this.client.isConnected;
  }

  // --- Low-Level Property Access ---

  async getProperty(name) {
    return await this.client.sendCommand(['get_property', name]);
  }

  async setProperty(name, value) {
    return await this.client.sendCommand(['set_property', name, value]);
  }

  async observeProperty(name) {
    const id = this.observerCounter++;
    this.observedProperties.set(id, name);
    await this.client.sendCommand(['observe_property', id, name]);
    return id;
  }

  // --- Transport Controls ---

  async play() {
    return await this.setProperty('pause', false);
  }

  async pause() {
    return await this.setProperty('pause', true);
  }

  async togglePause() {
    return await this.client.sendCommand(['cycle', 'pause']);
  }

  async stop() {
    return await this.client.sendCommand(['stop']);
  }

  async next() {
    return await this.client.sendCommand(['playlist-next', 'weak']);
  }

  async prev() {
    return await this.client.sendCommand(['playlist-prev', 'weak']);
  }

  // --- Volume & Audio ---

  async setVolume(volume) {
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    return await this.setProperty('volume', clamped);
  }

  async getVolume() {
    return await this.getProperty('volume');
  }

  // --- Seeking & Timeline ---

  /**
   * Seek playback
   * @param {number} seconds 
   * @param {'relative'|'absolute'|'relative-percent'|'absolute-percent'} mode 
   */
  async seek(seconds, mode = 'absolute') {
    return await this.client.sendCommand(['seek', seconds, mode]);
  }

  async getTimePos() {
    try {
      return await this.getProperty('time-pos');
    } catch {
      return 0;
    }
  }

  async getDuration() {
    try {
      return await this.getProperty('duration');
    } catch {
      return 0;
    }
  }

  // --- Playlist & Queue ---

  /**
   * Load a media file or URL into MPV
   * @param {string} url 
   * @param {'replace'|'append'|'append-play'} mode 
   */
  async loadFile(url, mode = 'append-play') {
    return await this.client.sendCommand(['loadfile', url, mode]);
  }

  async getPlaylist() {
    try {
      const playlist = await this.getProperty('playlist');
      return Array.isArray(playlist) ? playlist : [];
    } catch {
      return [];
    }
  }

  async playlistRemove(index) {
    return await this.client.sendCommand(['playlist-remove', index]);
  }

  async playlistMove(fromIndex, toIndex) {
    return await this.client.sendCommand(['playlist-move', fromIndex, toIndex]);
  }

  async playlistClear() {
    return await this.client.sendCommand(['playlist-clear']);
  }

  async playIndex(index) {
    return await this.setProperty('playlist-pos', index);
  }

  // --- Comprehensive Status Fetch ---

  async getFullStatus() {
    if (!this.isConnected) {
      return {
        connected: false,
        paused: true,
        idle: true,
        title: '',
        artist: '',
        duration: 0,
        timePos: 0,
        volume: 100,
        playlist: [],
        currentTrackIndex: -1,
      };
    }

    try {
      const [
        paused,
        idle,
        title,
        mediaTitle,
        duration,
        timePos,
        volume,
        playlist,
        playlistPos,
      ] = await Promise.allSettled([
        this.getProperty('pause'),
        this.getProperty('idle-active'),
        this.getProperty('track-list/0/title'),
        this.getProperty('media-title'),
        this.getProperty('duration'),
        this.getProperty('time-pos'),
        this.getProperty('volume'),
        this.getProperty('playlist'),
        this.getProperty('playlist-pos'),
      ]);

      return {
        connected: true,
        paused: paused.status === 'fulfilled' ? !!paused.value : false,
        idle: idle.status === 'fulfilled' ? !!idle.value : false,
        title: (mediaTitle.status === 'fulfilled' && mediaTitle.value) ? mediaTitle.value : ((title.status === 'fulfilled' && title.value) ? title.value : ''),
        duration: duration.status === 'fulfilled' && typeof duration.value === 'number' ? Math.round(duration.value) : 0,
        timePos: timePos.status === 'fulfilled' && typeof timePos.value === 'number' ? Math.round(timePos.value) : 0,
        volume: volume.status === 'fulfilled' && typeof volume.value === 'number' ? Math.round(volume.value) : 100,
        playlist: playlist.status === 'fulfilled' && Array.isArray(playlist.value) ? playlist.value : [],
        currentTrackIndex: playlistPos.status === 'fulfilled' && typeof playlistPos.value === 'number' ? playlistPos.value : -1,
      };
    } catch (err) {
      return {
        connected: true,
        error: err.message,
      };
    }
  }

  destroy() {
    this.client.destroy();
  }
}

module.exports = MpvController;
