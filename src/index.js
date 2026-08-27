const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const cors = require('cors');

const config = require('../config');
const MpvController = require('./mpv/mpvController');
const StateManager = require('./services/stateManager');
const createApiRouter = require('./routes/api');

// 1. Initialize Express App
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(config.publicDir));

// 2. Initialize MPV Controller & State Manager
const mpv = new MpvController(config.mpvSocketPath, {
  reconnectInterval: config.reconnectInterval,
});
const stateManager = new StateManager(mpv, {
  pollInterval: config.pollInterval,
});

// 3. Mount REST API Router
app.use('/api', createApiRouter(mpv, stateManager));

// 4. Create HTTP Server & WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/**
 * Broadcast payload to all connected clients
 * @param {object} payload 
 */
function broadcast(payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// 5. Connect StateManager events to WebSocket broadcast
stateManager.on('state_change', (evt) => {
  broadcast(evt);
});

// 6. Handle WebSocket Client Connections & Actions
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WebSocket] Client connected: ${clientIp}`);

  // Send current state immediately upon connection
  ws.send(JSON.stringify({
    type: 'STATE_SYNC',
    state: stateManager.getState(),
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { action, value, url, playNow, from, to, index } = data;

      if (!mpv.isConnected) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'MPV IPC is not connected' }));
        return;
      }

      switch (action) {
        case 'play':
          await mpv.play();
          break;
        case 'pause':
          await mpv.pause();
          break;
        case 'toggle':
          await mpv.togglePause();
          break;
        case 'stop':
          await mpv.stop();
          break;
        case 'next':
          await mpv.next();
          break;
        case 'prev':
          await mpv.prev();
          break;
        case 'seek':
          if (typeof value === 'number') {
            await mpv.seek(value, 'absolute');
          }
          break;
        case 'set_volume':
          if (typeof value === 'number') {
            await mpv.setVolume(value);
          }
          break;
        case 'add_url':
          if (url && typeof url === 'string') {
            const mode = playNow ? 'replace' : 'append-play';
            await mpv.loadFile(url.trim(), mode);
            setTimeout(() => stateManager.refreshFullState(), 300);
          }
          break;
        case 'remove_queue_item':
          if (typeof index === 'number') {
            await mpv.playlistRemove(index);
            setTimeout(() => stateManager.refreshFullState(), 200);
          }
          break;
        case 'move_queue_item':
          if (typeof from === 'number' && typeof to === 'number') {
            await mpv.playlistMove(from, to);
            setTimeout(() => stateManager.refreshFullState(), 200);
          }
          break;
        case 'play_queue_index':
          if (typeof index === 'number') {
            await mpv.playIndex(index);
            setTimeout(() => stateManager.refreshFullState(), 200);
          }
          break;
        case 'clear_queue':
          await mpv.playlistClear();
          setTimeout(() => stateManager.refreshFullState(), 200);
          break;
        case 'get_state':
          ws.send(JSON.stringify({
            type: 'STATE_SYNC',
            state: stateManager.getState(),
          }));
          break;
        default:
          console.warn(`[WebSocket] Unknown client action: ${action}`);
      }
    } catch (err) {
      console.error('[WebSocket] Message handling error:', err.message);
      ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
    }
  });

  ws.on('close', () => {
    // Client disconnected
  });
});

// 7. Setup MPV Property Observers on Connection
mpv.on('connect', async () => {
  console.log(`[MPV] Connected to IPC socket at ${config.mpvSocketPath}`);
  try {
    await mpv.observeProperty('pause');
    await mpv.observeProperty('idle-active');
    await mpv.observeProperty('media-title');
    await mpv.observeProperty('path');
    await mpv.observeProperty('duration');
    await mpv.observeProperty('time-pos');
    await mpv.observeProperty('volume');
    await mpv.observeProperty('playlist');
    console.log('[MPV] Registered property observers.');
  } catch (err) {
    console.warn('[MPV] Observer registration notice:', err.message);
  }
});

mpv.on('disconnect', () => {
  console.warn(`[MPV] Disconnected from IPC socket. Reconnecting in ${config.reconnectInterval}ms...`);
});

mpv.on('socket_error', (err) => {
  // Silent or log info about missing socket
  if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
    // Common when mpv daemon is not yet launched
  } else {
    console.error('[MPV Socket Error]', err.message);
  }
});

// 8. Start Services
mpv.start();

server.listen(config.port, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` 🎵 Antigravity-Player Web Service Started`);
  console.log(` 🌐 Web UI: http://0.0.0.0:${config.port}`);
  console.log(` 🔌 MPV IPC Socket: ${config.mpvSocketPath}`);
  console.log(` 🔊 Audio Device: ${config.audioDevice}`);
  console.log(`====================================================`);
});

// Fast and clean shutdown
function handleShutdown() {
  console.log('\n[Server] Shutting down immediately...');
  try {
    // Terminate all open WebSocket clients
    wss.clients.forEach((client) => {
      try {
        client.terminate();
      } catch {}
    });
    wss.close();
    mpv.destroy();
    stateManager.destroy();
    server.close();
  } catch {}
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
