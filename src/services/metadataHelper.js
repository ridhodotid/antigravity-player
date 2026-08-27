/**
 * Metadata & YouTube URL Parser Helper
 */

class MetadataHelper {
  /**
   * Extract YouTube Video ID from various YouTube URL formats
   * (e.g., youtube.com/watch?v=ID, youtu.be/ID, music.youtube.com/watch?v=ID, youtube.com/shorts/ID)
   * @param {string} url 
   * @returns {string|null}
   */
  static extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return null;

    const cleanUrl = url.trim();

    // Regex covering watch, youtu.be, embed, shorts, music.youtube
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^"&?\/\s]{11})/i;
    const match = cleanUrl.match(ytRegex);

    return match && match[1] ? match[1] : null;
  }

  /**
   * Get YouTube thumbnail URLs based on video ID or URL
   * @param {string} urlOrId 
   * @returns {string|null}
   */
  static getYouTubeThumbnail(urlOrId) {
    if (!urlOrId) return null;
    const videoId = urlOrId.length === 11 && !urlOrId.includes('/') ? urlOrId : this.extractYouTubeId(urlOrId);
    if (!videoId) return null;

    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }

  /**
   * Parse "Artist - Title" pattern commonly found in YouTube music titles
   * @param {string} rawTitle 
   * @returns {{ artist: string, title: string }}
   */
  static parseTitleAndArtist(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') {
      return { artist: '', title: 'Unknown Track' };
    }

    const cleaned = rawTitle
      .replace(/\s*\[.*?\]\s*/g, ' ') // remove [Official Video], [HD], etc.
      .replace(/\s*\(.*?official.*?\)\s*/gi, ' ')
      .replace(/\s*\(.*?music video.*?\)\s*/gi, ' ')
      .replace(/\s*\(.*?lyric.*?\)\s*/gi, ' ')
      .trim();

    const delimiters = [' - ', ' – ', ' — ', ' | ', ' : '];
    for (const delim of delimiters) {
      if (cleaned.includes(delim)) {
        const parts = cleaned.split(delim);
        if (parts.length >= 2) {
          const artist = parts[0].trim();
          const title = parts.slice(1).join(delim).trim();
          if (artist && title) {
            return { artist, title };
          }
        }
      }
    }

    return { artist: '', title: cleaned || rawTitle };
  }

  /**
   * Validate if string is a valid HTTP/HTTPS audio or stream URL
   * @param {string} url 
   * @returns {boolean}
   */
  static isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

module.exports = MetadataHelper;
