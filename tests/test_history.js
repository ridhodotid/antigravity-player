const assert = require('assert');
const historyManager = require('../src/services/historyManager');

console.log('🧪 Testing HistoryManager Persistence...');

// 1. Clear existing history for test
historyManager.clearHistory();
assert.strictEqual(historyManager.getHistory().length, 0, 'History should be empty after clear');

// 2. Add songs
historyManager.addHistory({
  url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  thumbnail: 'https://img.youtube.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
  duration: 360,
});

historyManager.addHistory({
  url: 'https://www.youtube.com/watch?v=backnumber123',
  title: 'Happy End',
  artist: 'back number',
  thumbnail: 'https://img.youtube.com/vi/backnumber123/hqdefault.jpg',
  duration: 319,
});

const history = historyManager.getHistory();
assert.strictEqual(history.length, 2, 'History should have 2 songs');
assert.strictEqual(history[0].title, 'Happy End', 'Most recent song should be at the top');
assert.strictEqual(history[1].title, 'Bohemian Rhapsody', 'Older song should be second');

console.log('✅ HistoryManager tests passed successfully!');
