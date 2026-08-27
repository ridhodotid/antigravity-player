/**
 * Mock MPV Server and Integration Test Suite
 * Tests IPC socket message exchange, request-response matching, property changes, and metadata helper.
 */

const net = require('net');
const path = require('path');
const assert = require('assert');
const MetadataHelper = require('../src/services/metadataHelper');
const MpvController = require('../src/mpv/mpvController');
const StateManager = require('../src/services/stateManager');

const isWindows = process.platform === 'win32';
const TEST_SOCKET = isWindows
  ? '\\\\.\\pipe\\test_mpv_socket_' + Date.now()
  : path.join(__dirname, 'test_mpv.sock');

async function runTests() {
  console.log('🧪 Starting Antigravity-Player Unit & Integration Tests...\n');

  // Test 1: MetadataHelper unit tests
  console.log('▶ Test 1: MetadataHelper Unit Tests');
  {
    const ytUrl1 = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const id1 = MetadataHelper.extractYouTubeId(ytUrl1);
    assert.strictEqual(id1, 'dQw4w9WgXcQ', 'Should extract standard watch URL ID');

    const ytUrl2 = 'https://youtu.be/dQw4w9WgXcQ?t=42';
    const id2 = MetadataHelper.extractYouTubeId(ytUrl2);
    assert.strictEqual(id2, 'dQw4w9WgXcQ', 'Should extract short URL ID');

    const ytMusicUrl = 'https://music.youtube.com/watch?v=dQw4w9WgXcQ';
    const id3 = MetadataHelper.extractYouTubeId(ytMusicUrl);
    assert.strictEqual(id3, 'dQw4w9WgXcQ', 'Should extract YouTube Music ID');

    const thumb = MetadataHelper.getYouTubeThumbnail(ytUrl1);
    assert.strictEqual(thumb, 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');

    const parsed = MetadataHelper.parseTitleAndArtist('Rick Astley - Never Gonna Give You Up (Official Music Video)');
    assert.strictEqual(parsed.artist, 'Rick Astley');
    assert.strictEqual(parsed.title, 'Never Gonna Give You Up');

    console.log('  ✔ MetadataHelper tests passed successfully.');
  }

  // Test 2: Mock MPV Server IPC Communication
  console.log('\n▶ Test 2: MPV IPC Socket Communication & StateManager');
  {
    let serverReceivedCommands = [];
    const mockMpvServer = net.createServer((clientSocket) => {
      let buffer = '';
      clientSocket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          const req = JSON.parse(line);
          serverReceivedCommands.push(req);

          // Respond based on command
          const cmd = req.command[0];
          if (cmd === 'get_property') {
            const prop = req.command[1];
            let val = null;
            if (prop === 'volume') val = 85;
            if (prop === 'pause') val = false;
            if (prop === 'idle-active') val = false;
            if (prop === 'media-title') val = 'Queen - Bohemian Rhapsody';
            if (prop === 'duration') val = 354;
            if (prop === 'time-pos') val = 42;
            if (prop === 'playlist') val = [{ id: 0, filename: 'https://youtu.be/test', title: 'Bohemian Rhapsody', current: true }];

            clientSocket.write(JSON.stringify({ error: 'success', data: val, request_id: req.request_id }) + '\n');
          } else {
            // Success response for setters and actions
            clientSocket.write(JSON.stringify({ error: 'success', data: null, request_id: req.request_id }) + '\n');
          }
        }
      });
    });

    await new Promise((resolve) => mockMpvServer.listen(TEST_SOCKET, resolve));

    const mpv = new MpvController(TEST_SOCKET, { reconnectInterval: 500 });
    const stateManager = new StateManager(mpv, { pollInterval: 500 });

    await new Promise((resolve) => {
      mpv.on('connect', resolve);
      mpv.start();
    });

    console.log('  ✔ Connected to mock MPV IPC socket');

    // Test Volume command
    await mpv.setVolume(75);
    assert(serverReceivedCommands.some((c) => c.command[0] === 'set_property' && c.command[1] === 'volume' && c.command[2] === 75), 'Volume command sent correctly');

    // Test Toggle Pause command
    await mpv.togglePause();
    assert(serverReceivedCommands.some((c) => c.command[0] === 'cycle' && c.command[1] === 'pause'), 'Toggle pause command sent correctly');

    // Test LoadFile command
    await mpv.loadFile('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'append-play');
    assert(serverReceivedCommands.some((c) => c.command[0] === 'loadfile' && c.command[2] === 'append-play'), 'Loadfile command sent correctly');

    // Test StateManager full sync
    await stateManager.refreshFullState();
    const state = stateManager.getState();
    assert.strictEqual(state.connected, true);
    assert.strictEqual(state.title, 'Bohemian Rhapsody');
    assert.strictEqual(state.artist, 'Queen');
    assert.strictEqual(state.duration, 354);

    console.log('  ✔ StateManager accurately synchronized state with mock MPV');

    // Cleanup
    mpv.destroy();
    stateManager.destroy();
    await new Promise((resolve) => mockMpvServer.close(resolve));
    console.log('  ✔ IPC socket client & server cleanly torn down');
  }

  console.log('\n========================================================');
  console.log(' 🎉 ALL TESTS PASSED! Project is ready for production.');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
