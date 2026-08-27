/**
 * Antigravity-Player Frontend Client
 * WebSocket State Synchronization, Sidebar Navigation & Interactive UI Controller
 */

class AntigravityPlayerApp {
  constructor() {
    this.ws = null;
    this.reconnectInterval = 2000;
    this.isUserSeeking = false;
    this.isUserChangingVolume = false;
    this.lastMutedVolume = 80;

    this.currentView = 'player'; // 'player' | 'queue' | 'search' | 'add' | 'device'

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

    this._cacheDOMElements();
    this._bindDOMEvents();
    this._connectWebSocket();
  }

  _cacheDOMElements() {
    // Body & Sidebar Drawer
    this.appBody = document.getElementById('app-body');
    this.sidebarBackdrop = document.getElementById('sidebar-backdrop');
    this.sidebarDrawer = document.getElementById('sidebar-drawer');
    this.btnOpenSidebar = document.getElementById('btn-open-sidebar');
    this.btnCloseSidebar = document.getElementById('btn-close-sidebar');
    this.navItems = document.querySelectorAll('[data-nav]');
    this.headerViewTitle = document.getElementById('header-view-title');
    this.sidebarQueueCount = document.getElementById('sidebar-queue-count');

    // Connection Indicators
    this.connBadge = document.getElementById('connection-badge');
    this.connText = document.getElementById('connection-text');
    this.connDot = document.getElementById('connection-dot');
    this.globalFeedback = document.getElementById('global-feedback');

    // Views
    this.viewPanels = {
      player: document.getElementById('view-player'),
      queue: document.getElementById('view-queue'),
      search: document.getElementById('view-search'),
      add: document.getElementById('view-add'),
      device: document.getElementById('view-device'),
    };

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

    // Queue View
    this.queueList = document.getElementById('queue-list');
    this.queueEmptyState = document.getElementById('queue-empty');
    this.queueCountBadge = document.getElementById('queue-count');
    this.btnClearQueue = document.getElementById('btn-clear-queue');

    // Search View
    this.formSearch = document.getElementById('form-search');
    this.inputSearchQuery = document.getElementById('input-search-query');
    this.searchLoading = document.getElementById('search-loading');
    this.searchEmpty = document.getElementById('search-empty');
    this.searchResults = document.getElementById('search-results');

    // Add Media View
    this.formAddMedia = document.getElementById('form-add-media');
    this.inputMediaUrl = document.getElementById('input-media-url');
    this.btnAddQueue = document.getElementById('btn-add-queue');
    this.btnPlayNow = document.getElementById('btn-play-now');

    // Service Restart Buttons
    this.btnSidebarRestartMpv = document.getElementById('btn-sidebar-restart-mpv');
    this.btnSidebarRestartService = document.getElementById('btn-sidebar-restart-service');
    this.btnDeviceRestartMpv = document.getElementById('btn-device-restart-mpv');
    this.btnDeviceRestartService = document.getElementById('btn-device-restart-service');

    // PWA Install Button
    this.btnPwaInstall = document.getElementById('btn-pwa-install');
    this.deferredPrompt = null;
  }

  _bindDOMEvents() {
    // Sidebar open/close
    this.btnOpenSidebar.addEventListener('click', () => this.openSidebar());
    this.btnCloseSidebar.addEventListener('click', () => this.closeSidebar());
    this.sidebarBackdrop.addEventListener('click', () => this.closeSidebar());

    // Sidebar navigation
    this.navItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-nav');
        this.switchView(targetView);
        this.closeSidebar();
      });
    });

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

    // Queue Management
    this.btnClearQueue.addEventListener('click', () => {
      if (confirm('Clear all songs from the playlist queue?')) {
        this.sendAction({ action: 'clear_queue' });
      }
    });

    // Search Form
    if (this.formSearch) {
      this.formSearch.addEventListener('submit', (e) => {
        e.preventDefault();
        this.performSearch();
      });
    }

    // Ingestion Form (Add Media)
    this.formAddMedia.addEventListener('submit', (e) => {
      e.preventDefault();
      this._submitMedia(false);
    });

    this.btnAddQueue.addEventListener('click', () => this._submitMedia(false));
    this.btnPlayNow.addEventListener('click', () => this._submitMedia(true));

    // Service Restart triggers
    const triggerRestartMpv = () => this.restartMpv();
    const triggerRestartService = () => this.restartService();

    if (this.btnSidebarRestartMpv) this.btnSidebarRestartMpv.addEventListener('click', triggerRestartMpv);
    if (this.btnDeviceRestartMpv) this.btnDeviceRestartMpv.addEventListener('click', triggerRestartMpv);

    if (this.btnSidebarRestartService) this.btnSidebarRestartService.addEventListener('click', triggerRestartService);
    if (this.btnDeviceRestartService) this.btnDeviceRestartService.addEventListener('click', triggerRestartService);

    // PWA Install Prompt Handling
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (this.btnPwaInstall) {
        this.btnPwaInstall.classList.remove('hidden');
      }
    });

    if (this.btnPwaInstall) {
      this.btnPwaInstall.addEventListener('click', async () => {
        if (this.deferredPrompt) {
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            this.showToast('Antigravity Player installed successfully!', 'success');
          }
          this.deferredPrompt = null;
          this.btnPwaInstall.classList.add('hidden');
        } else {
          this.showToast('To install: tap Share or Browser Menu -> "Add to Home Screen"', 'info');
        }
      });
    }

    this._registerServiceWorker();
  }

  _registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker registered with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err.message);
          });
      });
    }
  }

  openSidebar() {
    this.appBody.classList.add('sidebar-open');
  }

  closeSidebar() {
    this.appBody.classList.remove('sidebar-open');
  }

  switchView(viewName) {
    if (!this.viewPanels[viewName]) return;
    this.currentView = viewName;

    // Toggle panels
    Object.entries(this.viewPanels).forEach(([name, el]) => {
      if (el) {
        el.classList.toggle('hidden', name !== viewName);
      }
    });

    // Update nav item active styles
    this.navItems.forEach((btn) => {
      const isCurrent = btn.getAttribute('data-nav') === viewName;
      if (isCurrent) {
        btn.className = 'nav-item w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-colors text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
      } else {
        btn.className = 'nav-item w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-colors text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent';
      }
    });

    // Update Header Title
    const titles = {
      player: 'Antigravity',
      queue: 'Queue / Up Next',
      search: 'YouTube Search',
      add: 'Paste URL',
      device: 'Device & Settings',
    };
    this.headerViewTitle.textContent = titles[viewName] || 'Antigravity';
  }

  async restartMpv() {
    this.showToast('Resetting MPV Socket connection...', 'info');
    try {
      const res = await fetch('/api/system/restart-mpv', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.showToast('MPV Socket connection reset successfully!', 'success');
      } else {
        this.showToast('Failed to reset MPV socket: ' + data.error, 'error');
      }
    } catch (err) {
      this.showToast('Error resetting MPV: ' + err.message, 'error');
    }
  }

  async restartService() {
    if (!confirm('Are you sure you want to restart the Antigravity Player service? Audio playback will pause briefly.')) {
      return;
    }

    this.showToast('Restarting Antigravity Player service...', 'warning');
    try {
      await fetch('/api/system/restart-service', { method: 'POST' });
      setTimeout(() => {
        location.reload();
      }, 2500);
    } catch (err) {
      this.showToast('Restart command sent. Reconnecting in 3s...', 'info');
      setTimeout(() => {
        location.reload();
      }, 3000);
    }
  }

  showToast(msg, type = 'success') {
    const colors = {
      success: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
      error: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
      warning: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
      info: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
    };

    this.globalFeedback.textContent = msg;
    this.globalFeedback.className = `p-3 rounded-xl text-xs font-semibold text-center transition-all ${colors[type] || colors.info}`;
    this.globalFeedback.classList.remove('hidden');

    setTimeout(() => {
      this.globalFeedback.classList.add('hidden');
    }, 4000);
  }

  _submitMedia(playNow) {
    const url = this.inputMediaUrl.value.trim();
    if (!url) {
      this.showToast('Please enter a valid YouTube or stream URL', 'error');
      return;
    }

    this.sendAction({
      action: 'add_url',
      url,
      playNow,
    });

    this.showToast(playNow ? 'Playing track now...' : 'Added track to queue!', 'success');
    this.inputMediaUrl.value = '';

    setTimeout(() => {
      this.switchView('queue');
    }, 800);
  }

  async performSearch() {
    const query = this.inputSearchQuery.value.trim();
    if (!query) return;

    this.searchEmpty.classList.add('hidden');
    this.searchResults.classList.add('hidden');
    this.searchLoading.classList.remove('hidden');

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      this.searchLoading.classList.add('hidden');

      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        this.renderSearchResults(data.data);
      } else {
        this.searchResults.innerHTML = `
          <div class="py-16 text-center text-slate-500 text-sm">
            <p>No results found for "${this._escapeHtml(query)}"</p>
          </div>
        `;
        this.searchResults.classList.remove('hidden');
      }
    } catch (err) {
      this.searchLoading.classList.add('hidden');
      this.searchResults.innerHTML = `
        <div class="py-16 text-center text-rose-400 text-sm">
          <p>Search failed. Please try again.</p>
        </div>
      `;
      this.searchResults.classList.remove('hidden');
    }
  }

  renderSearchResults(results) {
    this.searchResults.innerHTML = results.map((item) => {
      const title = this._escapeHtml(item.title);
      const artist = this._escapeHtml(item.artist);
      const duration = this._escapeHtml(item.duration);
      const thumb = item.thumbnail || `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`;
      const escapedUrl = encodeURIComponent(item.url);

      return `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <img src="${thumb}" class="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-xs sm:text-sm font-semibold text-slate-100 truncate">${title}</p>
              <div class="flex items-center gap-2 text-[11px] text-slate-400">
                <span class="truncate">${artist}</span>
                <span>•</span>
                <span>${duration}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 ml-2 flex-shrink-0">
            <button
              onclick="window.playerApp.queueSearchResult('${escapedUrl}')"
              class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 text-xs font-semibold"
              title="Add to Queue"
            >
              + Queue
            </button>
            <button
              onclick="window.playerApp.playSearchResult('${escapedUrl}')"
              class="p-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold active:scale-95 text-xs shadow-md shadow-emerald-500/20"
              title="Play Now"
            >
              ▶ Play
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.searchResults.classList.remove('hidden');
  }

  playSearchResult(escapedUrl) {
    const url = decodeURIComponent(escapedUrl);
    this.sendAction({ action: 'add_url', url, playNow: true });
    this.showToast('Playing track immediately...', 'success');
    this.switchView('player');
  }

  queueSearchResult(escapedUrl) {
    const url = decodeURIComponent(escapedUrl);
    this.sendAction({ action: 'add_url', url, playNow: false });
    this.showToast('Track added to queue!', 'success');
  }

  _connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
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
      this.connText.textContent = 'Online';
      this.connDot.className = 'w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse';
    } else {
      this.connBadge.className = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20';
      this.connText.textContent = 'Offline';
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
      this.playbackStatus.className = 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300';
    } else if (this.state.paused) {
      this.playbackStatus.textContent = 'PAUSED';
      this.playbackStatus.className = 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30';
    } else {
      this.playbackStatus.textContent = 'PLAYING';
      this.playbackStatus.className = 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
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
    if (this.sidebarQueueCount) this.sidebarQueueCount.textContent = `${list.length}`;

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
