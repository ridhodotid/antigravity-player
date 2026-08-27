const https = require('https');
const { execFile } = require('child_process');
const fs = require('fs');
const config = require('../../config');

/**
 * YouTubeSearchService
 * Uses YouTube Innertube API v1 for instant, reliable, cookie-free search results,
 * with resilient fallbacks.
 */
class YouTubeSearchService {
  /**
   * Search YouTube for videos matching a query
   * @param {string} query 
   * @param {number} limit 
   * @returns {Promise<Array<{id: string, url: string, title: string, artist: string, duration: string, thumbnail: string}>>}
   */
  static async search(query, limit = 12) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    const cleanQuery = query.trim();

    // 1. Primary: YouTube Innertube API (Zero Scraping, Pure JSON, 100% reliable)
    try {
      const results = await this._searchViaInnertube(cleanQuery, limit);
      if (results && results.length > 0) {
        return results;
      }
    } catch (err) {
      console.warn('[YouTubeSearch] Innertube API attempt notice:', err.message);
    }

    // 2. Secondary: Fallback to HTML Scraping
    try {
      const results = await this._searchViaHtmlScrape(cleanQuery, limit);
      if (results && results.length > 0) {
        return results;
      }
    } catch (err) {
      console.warn('[YouTubeSearch] HTML scraping attempt notice:', err.message);
    }

    // 3. Tertiary: Fallback to yt-dlp CLI
    try {
      return await this._searchViaYtDlp(cleanQuery, limit);
    } catch (err) {
      console.error('[YouTubeSearch] All search methods failed:', err.message);
      return [];
    }
  }

  /**
   * Primary: YouTube Innertube Web Client Search API (Returns clean JSON)
   */
  static _searchViaInnertube(query, limit) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20231201.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
        query: query,
      });

      const options = {
        hostname: 'www.youtube.com',
        port: 443,
        path: '/youtubei/v1/search',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Innertube returned status ${res.statusCode}`));
        }

        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const sectionContents =
              json?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

            const results = [];
            for (const item of sectionContents) {
              if (results.length >= limit) break;

              const video = item.videoRenderer;
              if (!video || !video.videoId) continue;

              const videoId = video.videoId;
              const title = video.title?.runs?.[0]?.text || video.title?.accessibility?.accessibilityData?.label || 'Untitled';
              const artist = video.ownerText?.runs?.[0]?.text || video.shortBylineText?.runs?.[0]?.text || 'YouTube Channel';
              const duration = video.lengthText?.simpleText || video.lengthText?.runs?.[0]?.text || '--:--';
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

            resolve(results);
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error('Innertube request timed out'));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Secondary: HTML Scrape
   */
  static _searchViaHtmlScrape(query, limit) {
    return new Promise((resolve, reject) => {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': 'SOCS=CAESEwgDEgk2NDU4MzExMTgaAnVzIAEaBgiA_LyaBg;',
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
            const match = data.match(/var ytInitialData = ({.*?});<\/script>/s) || data.match(/ytInitialData = ({.*?});/s);
            if (!match || !match[1]) {
              return reject(new Error('ytInitialData not found in HTML'));
            }

            const initialData = JSON.parse(match[1]);
            const sectionContents =
              initialData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

            const results = [];
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

            resolve(results);
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Tertiary: yt-dlp CLI binary
   */
  static _searchViaYtDlp(query, limit) {
    return new Promise((resolve, reject) => {
      let binPath = 'yt-dlp';
      if (fs.existsSync('/usr/local/bin/yt-dlp')) {
        binPath = '/usr/local/bin/yt-dlp';
      } else if (fs.existsSync('/usr/bin/yt-dlp')) {
        binPath = '/usr/bin/yt-dlp';
      }

      const args = [
        '--dump-json',
        '--flat-playlist',
        `ytsearch${limit}:${query}`,
      ];

      execFile(binPath, args, { timeout: 12000 }, (error, stdout) => {
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
          } catch {}
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
