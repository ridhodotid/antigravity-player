const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

/**
 * HistoryManager
 * Manages persistent song playback history on the filesystem.
 */
class HistoryManager {
  constructor(maxItems = 100) {
    this.maxItems = maxItems;
    this.history = [];
    this._initStorage();
  }

  _initStorage() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
        this.history = JSON.parse(raw);
        if (!Array.isArray(this.history)) {
          this.history = [];
        }
      } else {
        this._save();
      }
    } catch (err) {
      console.warn('[HistoryManager] Storage init warning:', err.message);
      this.history = [];
    }
  }

  _save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (err) {
      console.error('[HistoryManager] Failed to save history:', err.message);
    }
  }

  /**
   * Add a track to playback history
   * @param {{ url: string, title: string, artist: string, thumbnail: string, duration: number }} track 
   */
  addHistory(track) {
    if (!track || (!track.title && !track.url)) return;

    const title = track.title || 'Unknown Title';
    const artist = track.artist || 'YouTube / Stream';
    const url = track.url || '';
    const thumbnail = track.thumbnail || null;
    const duration = track.duration || 0;

    // Filter out previous duplicate entry if exists
    this.history = this.history.filter((item) => {
      if (url && item.url === url) return false;
      if (title && item.title === title && item.artist === artist) return false;
      return true;
    });

    // Add to the beginning of the list
    this.history.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      url,
      title,
      artist,
      thumbnail,
      duration,
      playedAt: Date.now(),
    });

    // Trim to max items
    if (this.history.length > this.maxItems) {
      this.history = this.history.slice(0, this.maxItems);
    }

    this._save();
  }

  /**
   * Get playback history list
   * @param {number} limit 
   * @returns {Array}
   */
  getHistory(limit = 50) {
    return this.history.slice(0, limit);
  }

  /**
   * Clear all playback history
   */
  clearHistory() {
    this.history = [];
    this._save();
  }
}

// Singleton instance
module.exports = new HistoryManager();
