const YouTubeSearchService = require('../src/services/youtubeSearch');

async function testSearch() {
  console.log('🔍 Testing YouTubeSearchService with query: "Bohemian Rhapsody Queen" ...');
  try {
    const results = await YouTubeSearchService.search('Bohemian Rhapsody Queen', 5);
    console.log(`✅ Received ${results.length} search results:`);
    results.forEach((item, index) => {
      console.log(` ${index + 1}. [${item.duration}] ${item.title} - ${item.artist}`);
      console.log(`    URL: ${item.url}`);
      console.log(`    Thumb: ${item.thumbnail}`);
    });

    if (results.length > 0) {
      console.log('\n🎉 Search test passed successfully!');
    } else {
      console.log('\n⚠️ No results returned (check network/YouTube layout).');
    }
  } catch (err) {
    console.error('❌ Search test failed:', err);
  }
}

testSearch();
