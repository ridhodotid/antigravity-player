const https = require('https');
const { execFile } = require('child_process');
const config = require('../../config');

/**
 * YouTubeSearchService
 * Fast, lightweight YouTube search without requiring Google API keys.
 */
class YouTubeSearchService {
  /**
   * Search YouTube for videos matching a query
   * @param {string} query 
   * @param {number} limit 
   * @returns {Promise<Array<{id: string, url: string, title: string, artist: string, duration: string, thumbnail: string}>>}
   */
  static async search(query, limit = 10) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    const cleanQuery = query.trim();

    try {
      // 1. Try fast HTTPS scraping of YouTube search page
      const results = await this._searchViaHttp(cleanQuery, limit);
      if (results && results.length > 0) {
        return results;
      }
    } catch (err) {
      console.warn('[YouTubeSearch] HTTP search failed, falling back to yt-dlp:', err.message);
    }

    try {
      // 2. Fallback to yt-dlp binary
      return await this._searchViaYtDlp(cleanQuery, limit);
    } catch (err) {
      console.error('[YouTubeSearch] All search methods failed:', err.message);
      return [];
    }
  }

  /**
   * Scrapes ytInitialData from YouTube search results
   */
  static _searchViaHttp(query, limit) {
    return new Promise((resolve, reject) => {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      };

      https.get(url, options, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`YouTube returned status ${res.statusCode}`));
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const results = this._extractInitialData(data, limit);
            resolve(results);
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Parse HTML and extract video items from ytInitialData
   */
  static _extractInitialData(html, limit) {
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData = ({.*?});/s);
    if (!match || !match[1]) {
      throw new Error('ytInitialData not found in HTML response');
    }

    const initialData = JSON.parse(match[1]);
    const results = [];

    const sectionContents =
      initialData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

    for (const item of sectionContents) {
      if (results.length >= limit) break;

      const video = item.videoRenderer;
      if (!video || !video.videoId) continue;

      const videoId = video.videoId;
      const title = video.title?.runs?.[0]?.text || video.title?.accessibility?.accessibilityData?.label || 'Untitled';
      const artist = video.ownerText?.runs?.[0]?.text || video.shortBylineText?.runs?.[0]?.text || 'YouTube Channel';
      const duration = video.lengthText?.simpleText || (video.lengthText?.runs?.[0]?.text) || '--:--';
      const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      results.push({
        id: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        artist,
        duration,
        thumbnail,
      });
    }

    return results;
  }

  /**
   * Fallback using yt-dlp command line
   */
  static _searchViaYtDlp(query, limit) {
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-json',
        '--flat-playlist',
        '--default-search',
        `ytsearch${limit}`,
        query,
      ];

      execFile('yt-dlp', args, { timeout: 10000 }, (error, stdout) => {
        if (error) {
          return reject(error);
        }

        const lines = stdout.split('\n').filter((l) => l.trim());
        const results = [];

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.id) {
              results.push({
                id: data.id,
                url: data.url || `https://www.youtube.com/watch?v=${data.id}`,
                title: data.title || 'Untitled',
                artist: data.uploader || data.channel || 'YouTube',
                duration: data.duration ? this._formatSeconds(data.duration) : '--:--',
                thumbnail: data.thumbnail || `https://img.youtube.com/vi/${data.id}/hqdefault.jpg`,
              });
            }
          } catch {
            // Ignore parse errors on individual lines
          }
        }

        resolve(results);
      });
    });
  }

  static _formatSeconds(seconds) {
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  }
}

module.exports = YouTubeSearchService;
