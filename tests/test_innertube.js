const https = require('https');

function testInnertube(query) {
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
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const sectionContents =
          json?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

        const results = [];
        for (const item of sectionContents) {
          const video = item.videoRenderer;
          if (!video || !video.videoId) continue;

          const videoId = video.videoId;
          const title = video.title?.runs?.[0]?.text || video.title?.accessibility?.accessibilityData?.label || 'Untitled';
          const artist = video.ownerText?.runs?.[0]?.text || video.shortBylineText?.runs?.[0]?.text || 'YouTube Channel';
          const duration = video.lengthText?.simpleText || video.lengthText?.runs?.[0]?.text || '--:--';

          results.push({
            id: videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title,
            artist,
            duration,
            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          });
        }

        console.log(`✅ Innertube Success! Found ${results.length} items for query "${query}":`);
        results.slice(0, 5).forEach((r, i) => console.log(` ${i + 1}. [${r.duration}] ${r.title} (${r.artist})`));
      } catch (err) {
        console.error('Parse error:', err);
      }
    });
  });

  req.on('error', (e) => console.error('Req error:', e));
  req.write(payload);
  req.end();
}

testInnertube('back number');
