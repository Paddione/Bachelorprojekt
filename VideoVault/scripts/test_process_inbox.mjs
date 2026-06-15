import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = path.join(os.tmpdir(), 'videovault_test_' + Date.now());
const INBOX_DIR = path.join(TMP_DIR, 'Inbox');
const CATEGORIZED_DIR = path.join(TMP_DIR, 'Categorized');
const TEST_VIDEO_NAME = 'test_video.mp4';

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${cmd} ${args.join(' ')}`);
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function createDummyVideo(filePath) {
  console.log('Creating dummy video at', filePath);
  // Generate 1 second black video
  await run('ffmpeg', [
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=1280x720:d=1',
    '-c:v',
    'libx264',
    '-t',
    '1',
    '-y',
    filePath,
  ]);
}

async function main() {
  try {
    console.log('Setting up test environment in', TMP_DIR);
    await ensureDir(INBOX_DIR);
    await ensureDir(CATEGORIZED_DIR);

    const videoPath = path.join(INBOX_DIR, TEST_VIDEO_NAME);
    await createDummyVideo(videoPath);

    // Create a second video for duplicate testing
    const videoPath2 = path.join(INBOX_DIR, 'test_video_2.mp4');
    await createDummyVideo(videoPath2);

    console.log('Running process-inbox script...');
    await run('npm', ['run', 'process-inbox'], {
      env: {
        ...process.env,
        MOCK_AI: 'true',
        INBOX_DIR: INBOX_DIR,
        CATEGORIZED_DIR: CATEGORIZED_DIR,
      },
    });

    console.log('Verifying results...');
    const files = await fs.readdir(CATEGORIZED_DIR);
    console.log('Files in Categorized:', files);

    const expectedBase = 'mock_test_video';

    // Check first set of files
    const hasVideo1 = files.includes(`${expectedBase}.mp4`);
    const hasSprite1 = files.includes(`${expectedBase}_sprite.jpg`);
    const hasThumb1 = files.includes(`${expectedBase}_thumb.jpg`);

    // Check duplicate set (should have _1 suffix)
    // Note: MOCK_AI returns same name for both videos since logic is simple
    const hasVideo2 = files.includes(`${expectedBase}_1.mp4`);
    const hasSprite2 = files.includes(`${expectedBase}_1_sprite.jpg`);
    const hasThumb2 = files.includes(`${expectedBase}_1_thumb.jpg`);

    if (hasVideo1 && hasSprite1 && hasThumb1 && hasVideo2 && hasSprite2 && hasThumb2) {
      console.log('SUCCESS: All expected files found, including duplicates.');
    } else {
      console.error('FAILURE: Missing expected files.');
      console.error('Expected base:', expectedBase);
      process.exit(1);
    }
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  } finally {
    // Cleanup
    try {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
      console.log('Cleanup complete');
    } catch (e) {
      console.warn('Cleanup failed:', e.message);
    }
  }
}

main();
