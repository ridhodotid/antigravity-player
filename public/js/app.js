/**
 * Antigravity-Player Frontend Client
 * WebSocket State Synchronization & Interactive UI Controller
 */

class AntigravityPlayerApp {
  constructor() {
    this.ws = null;
    this.reconnectInterval = 2000;
    this.isUserSeeking = false;
    this.isUserChangingVolume = false;
    this.lastMutedVolume = 80;

    this.state = {
      connected: false,
      paused: true,
      idle: true,
      title: 'Antigravity Player',
      artist: 'Ready to Play',
      thumbnail: null,
      duration: 0,
      timePos: 0,
      volume: 100,
      playlist: [],
      currentTrackIndex: -1,
    };

    this.activeTab = 'queue'; // 'queue' | 'add' | 'device'

    this._cacheDOMElements();
    this._bindDOMEvents();
    this._connectWebSocket();
  }

  _cacheDOMElements() {
    // Connection Indicators
    this.connBadge = document.getElementById('connection-badge');
    this.connText = document.getElementById('connection-text');
    this.connDot = document.getElementById('connection-dot');

    // Hero / Now Playing
    this.thumbnailImg = document.getElementById('player-thumbnail');
    this.thumbnailFallback = document.getElementById('player-thumbnail-fallback');
    this.trackTitle = document.getElementById('track-title');
    this.trackArtist = document.getElementById('track-artist');
    this.playbackStatus = document.getElementById('playback-status');

    // Timeline / Seek
    this.timeCurrent = document.getElementById('time-current');
    this.timeTotal = document.getElementById('time-total');
    this.seekSlider = document.getElementById('seek-slider');

    // Controls
    this.btnPrev = document.getElementById('btn-prev');
    this.btnPlayPause = document.getElementById('btn-play-pause');
    this.iconPlay = document.getElementById('icon-play');
    this.iconPause = document.getElementById('icon-pause');
    this.btnNext = document.getElementById('btn-next');
    this.btnStop = document.getElementById('btn-stop');

    // Volume
    this.volumeSlider = document.getElementById('volume-slider');
    this.volumePercent = document.getElementById('volume-percent');
    this.btnMute = document.getElementById('btn-mute');
    this.iconVolHigh = document.getElementById('icon-vol-high');
    this.iconVolMute = document.getElementById('icon-vol-mute');

    // Tabs
    this.tabButtons = document.querySelectorAll('[data-tab-target]');
    this.tabContents = document.querySelectorAll('[data-tab-content]');

    // Queue Tab
    this.queueList = document.getElementById('queue-list');
    this.queueEmptyState = document.getElementById('queue-empty');
    this.queueCountBadge = document.getElementById('queue-count');
    this.btnClearQueue = document.getElementById('btn-clear-queue');

    // Add Media Tab
    this.formAddMedia = document.getElementById('form-add-media');
    this.inputMediaUrl = document.getElementById('input-media-url');
    this.btnAddQueue = document.getElementById('btn-add-queue');
    this.btnPlayNow = document.getElementById('btn-play-now');
    this.feedbackAlert = document.getElementById('add-feedback');
  }

  _bindDOMEvents() {
    // Playback buttons
    this.btnPlayPause.addEventListener('click', () => this.sendAction({ action: 'toggle' }));
    this.btnPrev.addEventListener('click', () => this.sendAction({ action: 'prev' }));
    this.btnNext.addEventListener('click', () => this.sendAction({ action: 'next' }));
    this.btnStop.addEventListener('click', () => this.sendAction({ action: 'stop' }));

    // Seeking Slider
    this.seekSlider.addEventListener('input', (e) => {
      this.isUserSeeking = true;
      const targetSec = parseInt(e.target.value, 10);
      this.timeCurrent.textContent = this.formatTime(targetSec);
    });

    this.seekSlider.addEventListener('change', (e) => {
      const targetSec = parseInt(e.target.value, 10);
      this.sendAction({ action: 'seek', value: targetSec });
      setTimeout(() => {
        this.isUserSeeking = false;
      }, 300);
    });

    // Volume Slider
    this.volumeSlider.addEventListener('input', (e) => {
      this.isUserChangingVolume = true;
      const vol = parseInt(e.target.value, 10);
      this.volumePercent.textContent = `${vol}%`;
      this._updateVolumeIcon(vol);
    });

    this.volumeSlider.addEventListener('change', (e) => {
      const vol = parseInt(e.target.value, 10);
      this.sendAction({ action: 'set_volume', value: vol });
      setTimeout(() => {
        this.isUserChangingVolume = false;
      }, 200);
    });

    // Mute Toggle
    this.btnMute.addEventListener('click', () => {
      if (this.state.volume > 0) {
        this.lastMutedVolume = this.state.volume;
        this.sendAction({ action: 'set_volume', value: 0 });
      } else {
        this.sendAction({ action: 'set_volume', value: this.lastMutedVolume || 80 });
      }
    });

    // Tab Navigation
    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab-target');
        this.switchTab(target);
      });
    });

    // Queue Management
    this.btnClearQueue.addEventListener('click', () => {
      if (confirm('Clear all songs from the playlist queue?')) {
        this.sendAction({ action: 'clear_queue' });
      }
    });

    // Ingestion Form (Add Media)
    this.formAddMedia.addEventListener('submit', (e) => {
      e.preventDefault();
      this._submitMedia(false);
    });

    this.btnAddQueue.addEventListener('click', () => this._submitMedia(false));
    this.btnPlayNow.addEventListener('click', () => this._submitMedia(true));
  }

  _submitMedia(playNow) {
    const url = this.inputMediaUrl.value.trim();
    if (!url) {
      this._showFeedback('Please enter a valid YouTube or stream URL', 'error');
      return;
    }

    this.sendAction({
      action: 'add_url',
      url,
      playNow,
    });

    this._showFeedback(playNow ? 'Playing track now...' : 'Added track to queue!', 'success');
    this.inputMediaUrl.value = '';

    // Switch back to queue tab after short delay
    setTimeout(() => {
      this.switchTab('queue');
    }, 800);
  }

  _showFeedback(msg, type = 'success') {
    this.feedbackAlert.textContent = msg;
    this.feedbackAlert.className = `p-3 rounded-xl text-sm text-center font-medium transition-all ${
      type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
    }`;
    this.feedbackAlert.classList.remove('hidden');

    setTimeout(() => {
      this.feedbackAlert.classList.add('hidden');
    }, 3500);
  }

  switchTab(targetTab) {
    this.activeTab = targetTab;
    this.tabButtons.forEach((btn) => {
      const isCurrent = btn.getAttribute('data-tab-target') === targetTab;
      btn.classList.toggle('text-emerald-400', isCurrent);
      btn.classList.toggle('border-emerald-500', isCurrent);
      btn.classList.toggle('text-slate-400', !isCurrent);
      btn.classList.toggle('border-transparent', !isCurrent);
    });

    this.tabContents.forEach((content) => {
      content.classList.toggle('hidden', content.getAttribute('data-tab-content') !== targetTab);
    });
  }

  _connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[WS] Connected to server');
      this._updateConnectionUI(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        this._handleServerMessage(payload);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('[WS] Disconnected from server. Reconnecting...');
      this._updateConnectionUI(false);
      setTimeout(() => this._connectWebSocket(), this.reconnectInterval);
    };

    this.ws.onerror = (err) => {
      console.error('[WS Error]', err);
    };
  }

  sendAction(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn('[WS] Cannot send action, socket is not open');
    }
  }

  _handleServerMessage(payload) {
    switch (payload.type) {
      case 'STATE_SYNC':
      case 'FULL_SYNC':
        this.state = { ...this.state, ...payload.state };
        this._renderFullUI();
        break;

      case 'CONNECTION_CHANGE':
        this.state.connected = payload.connected;
        this._updateConnectionUI(payload.connected);
        break;

      case 'TIME_UPDATE':
        this.state.timePos = payload.timePos;
        if (payload.duration !== undefined) this.state.duration = payload.duration;
        this._renderTimeline();
        break;

      case 'PROPERTY_CHANGE':
        if (payload.state) {
          this.state = { ...this.state, ...payload.state };
          this._renderFullUI();
        }
        break;

      default:
        break;
    }
  }

  _updateConnectionUI(connected) {
    if (connected && this.state.connected !== false) {
      this.connBadge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      this.connText.textContent = 'MPV Online';
      this.connDot.className = 'w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse';
    } else {
      this.connBadge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20';
      this.connText.textContent = 'MPV Offline';
      this.connDot.className = 'w-2 h-2 rounded-full bg-rose-400 mr-1.5';
    }
  }

  _renderFullUI() {
    this._updateConnectionUI(this.state.connected);

    // Track Title & Artist
    this.trackTitle.textContent = this.state.title || 'Antigravity Player';
    this.trackArtist.textContent = this.state.artist || 'Ready to Play';

    // Status Badge
    if (this.state.idle) {
      this.playbackStatus.textContent = 'IDLE';
      this.playbackStatus.className = 'text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700 text-slate-300';
    } else if (this.state.paused) {
      this.playbackStatus.textContent = 'PAUSED';
      this.playbackStatus.className = 'text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30';
    } else {
      this.playbackStatus.textContent = 'PLAYING';
      this.playbackStatus.className = 'text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    }

    // Play / Pause Icon Button
    if (this.state.paused || this.state.idle) {
      this.iconPlay.classList.remove('hidden');
      this.iconPause.classList.add('hidden');
    } else {
      this.iconPlay.classList.add('hidden');
      this.iconPause.classList.remove('hidden');
    }

    // Thumbnail Image
    if (this.state.thumbnail) {
      this.thumbnailImg.src = this.state.thumbnail;
      this.thumbnailImg.classList.remove('hidden');
      this.thumbnailFallback.classList.add('hidden');
    } else {
      this.thumbnailImg.classList.add('hidden');
      this.thumbnailFallback.classList.remove('hidden');
    }

    // Volume
    if (!this.isUserChangingVolume) {
      this.volumeSlider.value = this.state.volume;
      this.volumePercent.textContent = `${this.state.volume}%`;
      this._updateVolumeIcon(this.state.volume);
    }

    // Timeline & Queue
    this._renderTimeline();
    this._renderQueue();
  }

  _renderTimeline() {
    if (this.isUserSeeking) return;

    const current = Math.max(0, this.state.timePos || 0);
    const duration = Math.max(0, this.state.duration || 0);

    this.seekSlider.max = duration > 0 ? duration : 100;
    this.seekSlider.value = current;

    this.timeCurrent.textContent = this.formatTime(current);
    this.timeTotal.textContent = duration > 0 ? this.formatTime(duration) : '--:--';
  }

  _renderQueue() {
    const list = this.state.playlist || [];
    this.queueCountBadge.textContent = `${list.length}`;

    if (list.length === 0) {
      this.queueList.innerHTML = '';
      this.queueEmptyState.classList.remove('hidden');
      return;
    }

    this.queueEmptyState.classList.add('hidden');

    this.queueList.innerHTML = list.map((item, index) => {
      const isCurrent = item.current || index === this.state.currentTrackIndex;
      const title = item.title || item.filename || `Track ${index + 1}`;
      const thumb = item.thumbnail;

      return `
        <div class="flex items-center justify-between p-2.5 rounded-xl transition-colors ${
          isCurrent ? 'bg-emerald-500/15 border border-emerald-500/30' : 'hover:bg-slate-800/60 bg-slate-850 border border-slate-800'
        }">
          <div class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onclick="window.playerApp.playTrack(${index})">
            <div class="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg ${
              isCurrent ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
            } text-xs">
              ${isCurrent ? '▶' : index + 1}
            </div>
            ${
              thumb
                ? `<img src="${thumb}" class="w-9 h-9 rounded-lg object-cover flex-shrink-0" />`
                : `<div class="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-500 text-sm">🎵</div>`
            }
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate ${isCurrent ? 'text-emerald-400' : 'text-slate-200'}">
                ${this._escapeHtml(title)}
              </p>
            </div>
          </div>
          
          <div class="flex items-center gap-1 ml-2">
            ${
              index > 0
                ? `<button onclick="window.playerApp.moveTrack(${index}, ${index - 1})" class="p-1 text-slate-400 hover:text-slate-200 rounded" title="Move Up">▲</button>`
                : ''
            }
            ${
              index < list.length - 1
                ? `<button onclick="window.playerApp.moveTrack(${index}, ${index + 1})" class="p-1 text-slate-400 hover:text-slate-200 rounded" title="Move Down">▼</button>`
                : ''
            }
            <button onclick="window.playerApp.removeTrack(${index})" class="p-1 text-slate-500 hover:text-rose-400 rounded" title="Remove">✕</button>
          </div>
        </div>
      `;
    }).join('');
  }

  playTrack(index) {
    this.sendAction({ action: 'play_queue_index', index });
  }

  moveTrack(from, to) {
    this.sendAction({ action: 'move_queue_item', from, to });
  }

  removeTrack(index) {
    this.sendAction({ action: 'remove_queue_item', index });
  }

  _updateVolumeIcon(vol) {
    if (vol === 0) {
      this.iconVolHigh.classList.add('hidden');
      this.iconVolMute.classList.remove('hidden');
    } else {
      this.iconVolHigh.classList.remove('hidden');
      this.iconVolMute.classList.add('hidden');
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    const pad = (n) => (n < 10 ? `0${n}` : n);

    if (hrs > 0) {
      return `${hrs}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.playerApp = new AntigravityPlayerApp();
});
