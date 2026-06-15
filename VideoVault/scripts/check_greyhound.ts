import fs from 'fs';
import path from 'path';

async function main() {
  try {
    const res = await fetch('http://localhost:5100/api/videos');
    if (!res.ok) {
      console.error('Failed to fetch videos', res.status);
      process.exit(1);
    }
    interface Video {
      displayName?: string;
      path?: string;
      [key: string]: unknown;
    }
    const videos: Video[] = await res.json();
    console.log(`Total videos found: ${videos.length}`);

    const greyhounds = videos.filter((v) => {
      const lowerName = (v.displayName || '').toLowerCase();
      const lowerPath = (v.path || '').toLowerCase();
      return lowerName.includes('greyhound') || lowerPath.includes('greyhound');
    });
    console.log(`Greyhound videos found: ${greyhounds.length}`);

    let deadCount = 0;
    for (const v of greyhounds) {
      // Try exact path
      if (v.path && !fs.existsSync(v.path)) {
        // console.log(`Missing: ${v.path}`);
        deadCount++;
      }
    }
    console.log(`Dead Greyhound videos: ${deadCount}`);

    if (deadCount > 0) {
      console.log('Sample missing paths:');
      greyhounds
        .filter((v) => v.path && !fs.existsSync(v.path))
        .slice(0, 5)
        .forEach((v) => console.log(v.path));
    }
  } catch (err) {
    console.error(err);
  }
}

main();
