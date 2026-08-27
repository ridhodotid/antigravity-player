const path = require('path');

const isWindows = process.platform === 'win32';

const config = {
  // Web Server Port
  port: parseInt(process.env.PORT || '3000', 10),
  
  // MPV IPC Socket Path (Unix Socket for Linux / Named Pipe or Socket for Windows dev)
  mpvSocketPath: process.env.MPV_SOCKET || (isWindows ? '\\\\.\\pipe\\mpvsocket' : '/tmp/mpvsocket'),
  
  // ALSA Audio Output Device for Armbian STB
  audioDevice: process.env.AUDIO_DEVICE || 'alsa/plughw:1,0',
  
  // yt-dlp binary path
  ytdlPath: process.env.YTDL_PATH || '/usr/local/bin/yt-dlp',
  
  // IPC Reconnection interval (ms)
  reconnectInterval: parseInt(process.env.RECONNECT_INTERVAL || '2000', 10),
  
  // State Polling interval (ms) for continuous timeline sync
  pollInterval: parseInt(process.env.POLL_INTERVAL || '1000', 10),
  
  // Static files directory
  publicDir: path.join(__dirname, 'public'),
};

module.exports = config;
