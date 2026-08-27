const net = require('net');
const EventEmitter = require('events');

/**
 * MpvIpcClient
 * Manages low-level Unix Domain Socket / Named Pipe connection to MPV JSON-IPC server.
 */
class MpvIpcClient extends EventEmitter {
  constructor(socketPath, options = {}) {
    super();
    this.socketPath = socketPath;
    this.reconnectInterval = options.reconnectInterval || 2000;
    this.commandTimeout = options.commandTimeout || 5000;

    this.socket = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.reconnectTimer = null;

    this.requestIdCounter = 1;
    this.pendingRequests = new Map(); // requestId -> { resolve, reject, timer }
    this.buffer = '';
  }

  /**
   * Connect to the MPV IPC socket.
   */
  connect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.socket = net.createConnection(this.socketPath);
    this.socket.setEncoding('utf8');

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.isReconnecting = false;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.emit('connect');
    });

    this.socket.on('data', (chunk) => {
      this._handleData(chunk);
    });

    this.socket.on('error', (err) => {
      this.emit('socket_error', err);
      // 'close' event will trigger reconnect
    });

    this.socket.on('close', (hadError) => {
      const wasConnected = this.isConnected;
      this.isConnected = false;
      this._rejectAllPending('Socket connection closed');

      if (wasConnected) {
        this.emit('disconnect');
      }

      this._scheduleReconnect();
    });
  }

  /**
   * Internal data handler splitting by newline characters.
   */
  _handleData(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    // Keep the remainder in buffer
    this.buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed);
        this._processMessage(message);
      } catch (err) {
        this.emit('parse_error', err, trimmed);
      }
    }
  }

  /**
   * Process individual parsed JSON payload from MPV.
   */
  _processMessage(msg) {
    this.emit('raw_message', msg);

    // 1. Check if it's a response to a pending request
    if (msg.request_id !== undefined && this.pendingRequests.has(msg.request_id)) {
      const { resolve, reject, timer } = this.pendingRequests.get(msg.request_id);
      clearTimeout(timer);
      this.pendingRequests.delete(msg.request_id);

      if (msg.error === 'success') {
        resolve(msg.data);
      } else {
        const error = new Error(`MPV IPC Error: ${msg.error}`);
        error.mpvError = msg.error;
        reject(error);
      }
      return;
    }

    // 2. Check if it's an asynchronous event
    if (msg.event) {
      this.emit('event', msg);
      this.emit(`event:${msg.event}`, msg);

      if (msg.event === 'property-change') {
        this.emit('property-change', msg.name, msg.data, msg.id);
      }
    }
  }

  /**
   * Send a command array to MPV via JSON-IPC.
   * e.g., sendCommand(['set_property', 'volume', 80])
   * @param {Array} commandArray 
   * @returns {Promise<any>}
   */
  sendCommand(commandArray) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.socket) {
        return reject(new Error('MPV IPC client is not connected'));
      }

      const requestId = this.requestIdCounter++;
      const payload = {
        command: commandArray,
        request_id: requestId,
      };

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Command timed out after ${this.commandTimeout}ms: ${JSON.stringify(commandArray)}`));
        }
      }, this.commandTimeout);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      try {
        this.socket.write(JSON.stringify(payload) + '\n');
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(err);
      }
    });
  }

  /**
   * Schedule automatic reconnect.
   */
  _scheduleReconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    this.reconnectTimer = setTimeout(() => {
      this.isReconnecting = false;
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * Reject all active pending requests on socket drop.
   */
  _rejectAllPending(reason) {
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  /**
   * Disconnect and cleanup.
   */
  destroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._rejectAllPending('Client destroyed');
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnected = false;
  }
}

module.exports = MpvIpcClient;
