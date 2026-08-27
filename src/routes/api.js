const express = require('express');
const MetadataHelper = require('../services/metadataHelper');
const YouTubeSearchService = require('../services/youtubeSearch');

function createApiRouter(mpvController, stateManager) {
  const router = express.Router();

  // Search YouTube
  router.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
    }

    try {
      const results = await YouTubeSearchService.search(query.trim(), 12);
      res.json({
        success: true,
        query: query.trim(),
        data: results,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get current full player state
  router.get('/state', (req, res) => {
    res.json({
      success: true,
      data: stateManager.getState(),
    });
  });

  // Transport and seeking controls
  router.post('/control', async (req, res) => {
    const { action, value } = req.body;

    if (!mpvController.isConnected) {
      return res.status(503).json({ success: false, error: 'MPV is not connected' });
    }

    try {
      switch (action) {
        case 'play':
          await mpvController.play();
          break;
        case 'pause':
          await mpvController.pause();
          break;
        case 'toggle':
          await mpvController.togglePause();
          break;
        case 'stop':
          await mpvController.stop();
          break;
        case 'next':
          await mpvController.next();
          break;
        case 'prev':
          await mpvController.prev();
          break;
        case 'seek':
          if (typeof value === 'number') {
            await mpvController.seek(value, 'absolute');
          } else {
            return res.status(400).json({ success: false, error: 'Value (seconds) required for seek' });
          }
          break;
        default:
          return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }

      // Small delay to let MPV process and stateManager reflect
      setTimeout(() => stateManager.refreshFullState(), 100);

      res.json({ success: true, action });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Volume control (0-100)
  router.post('/volume', async (req, res) => {
    const { volume } = req.body;

    if (typeof volume !== 'number' || volume < 0 || volume > 100) {
      return res.status(400).json({ success: false, error: 'Volume must be a number between 0 and 100' });
    }

    if (!mpvController.isConnected) {
      return res.status(503).json({ success: false, error: 'MPV is not connected' });
    }

    try {
      await mpvController.setVolume(volume);
      res.json({ success: true, volume });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Queue / Media ingestion
  router.post('/queue/add', async (req, res) => {
    const { url, playNow } = req.body;

    if (!url || typeof url !== 'string' || !MetadataHelper.isValidUrl(url.trim())) {
      return res.status(400).json({ success: false, error: 'Valid HTTP/HTTPS URL is required' });
    }

    if (!mpvController.isConnected) {
      return res.status(503).json({ success: false, error: 'MPV is not connected' });
    }

    try {
      const mode = playNow ? 'replace' : 'append-play';
      const cleanUrl = url.trim();
      await mpvController.loadFile(cleanUrl, mode);

      setTimeout(() => stateManager.refreshFullState(), 300);

      res.json({
        success: true,
        message: playNow ? 'Playing immediately' : 'Added to queue',
        url: cleanUrl,
        mode,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Remove item from queue
  router.post('/queue/remove', async (req, res) => {
    const { index } = req.body;

    if (typeof index !== 'number' || index < 0) {
      return res.status(400).json({ success: false, error: 'Valid index is required' });
    }

    try {
      await mpvController.playlistRemove(index);
      setTimeout(() => stateManager.refreshFullState(), 200);
      res.json({ success: true, removedIndex: index });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Move item in queue (reorder)
  router.post('/queue/move', async (req, res) => {
    const { from, to } = req.body;

    if (typeof from !== 'number' || typeof to !== 'number' || from < 0 || to < 0) {
      return res.status(400).json({ success: false, error: 'Valid from and to indices are required' });
    }

    try {
      await mpvController.playlistMove(from, to);
      setTimeout(() => stateManager.refreshFullState(), 200);
      res.json({ success: true, from, to });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear entire queue
  router.post('/queue/clear', async (req, res) => {
    try {
      await mpvController.playlistClear();
      setTimeout(() => stateManager.refreshFullState(), 200);
      res.json({ success: true, message: 'Queue cleared' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Play specific track from queue
  router.post('/queue/play-index', async (req, res) => {
    const { index } = req.body;

    if (typeof index !== 'number' || index < 0) {
      return res.status(400).json({ success: false, error: 'Valid track index is required' });
    }

    try {
      await mpvController.playIndex(index);
      setTimeout(() => stateManager.refreshFullState(), 200);
      res.json({ success: true, playingIndex: index });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // System: Restart MPV Connection
  router.post('/system/restart-mpv', async (req, res) => {
    try {
      mpvController.client.destroy();
      setTimeout(() => {
        mpvController.start();
        setTimeout(() => stateManager.refreshFullState(), 500);
      }, 500);

      res.json({ success: true, message: 'MPV connection reset triggered' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // System: Restart Entire Service
  router.post('/system/restart-service', (req, res) => {
    res.json({ success: true, message: 'Restarting Antigravity Player service...' });
    setTimeout(() => {
      console.log('[System] Service restart requested via Web UI. Exiting for systemd restart...');
      process.exit(0);
    }, 600);
  });

  return router;
}

module.exports = createApiRouter;
