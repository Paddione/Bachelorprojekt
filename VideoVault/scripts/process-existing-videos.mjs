#!/usr/bin/env node
/**
 * Process Existing Videos
 *
 * Scans the media directory for video files and enqueues thumbnail/metadata
 * generation jobs for each video through the job queue system.
 *
 * Usage:
 *   node scripts/process-existing-videos.mjs [directory] [--concurrency=4]
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const [, , dirArg, ...restArgs] = process.argv;
const options = {
  concurrency: (() => {
    const m = restArgs.join(' ').match(/--concurrency\s*=\s*(\d+)/);
    const val = m ? parseInt(m[1], 10) : 4;
    return Number.isFinite(val) && val > 0 ? val : 4;
  })(),
};

const root = process.cwd();
const defaultMediaRoot = process.env.MEDIA_ROOT || path.join(root, 'Processed');
const targetDir = dirArg || defaultMediaRoot;
const apiBase = process.env.API_URL || 'http://localhost:5000';

const SUPPORTED_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm', '.m4v'];

/**
 * Calculate fast hash (first 64KB + last 64KB + file size)
 */
async function calculateFastHash(filePath) {
  const CHUNK_SIZE = 64 * 1024; // 64KB
  const handle = await fs.open(filePath, 'r');

  try {
    const stats = await handle.stat();
    const hash = crypto.createHash('sha256');

    // Read first 64KB
    const buffer1 = Buffer.alloc(Math.min(CHUNK_SIZE, stats.size));
    await handle.read(buffer1, 0, buffer1.length, 0);
    hash.update(buffer1);

    // Read last 64KB if file is large enough
    if (stats.size > CHUNK_SIZE) {
      const buffer2 = Buffer.alloc(CHUNK_SIZE);
      await handle.read(buffer2, 0, buffer2.length, stats.size - CHUNK_SIZE);
      hash.update(buffer2);
    }

    // Include file size
    hash.update(Buffer.from(stats.size.toString()));

    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

/**
 * Generate video ID (same as client-side logic)
 */
function generateVideoId(filename, size, lastModified) {
  const input = `${filename}-${size}-${lastModified}`;
  const bytes = Buffer.from(input, 'utf-8');
  return Buffer.from(bytes).toString('base64').replace(/[+/=]/g, '');
}

/**
 * Walk directory recursively
 */
async function* walkDir(dir, base = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      const sub = path.join(dir, e.name);
      const subBase = path.join(base, e.name);
      yield* walkDir(sub, subBase);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        yield { dir, base, name: e.name };
      }
    }
  }
}

/**
 * Enqueue job via API
 */
async function enqueueJob(type, videoId, payload, priority) {
  const response = await fetch(`${apiBase}/api/jobs/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      videoId,
      priority,
      payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to enqueue job: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Process single video file
 */
async function processOne(target, index, total) {
  const { dir, base, name } = target;
  const inputPath = path.join(dir, name);
  const relativePath = path.join(base, name);
  const progressStr = `[${index + 1}/${total}]`;

  try {
    console.log(`${progressStr} Processing: ${relativePath}`);

    // Get file stats
    const stats = await fs.stat(inputPath);

    // Calculate hash
    const fileHash = await calculateFastHash(inputPath);

    // Generate video ID
    const videoId = generateVideoId(name, stats.size, stats.mtimeMs);

    // Enqueue metadata extraction (high priority)
    await enqueueJob('metadata', videoId, {
      inputPath,
      videoId,
      rootKey: 'batch-process',
      relativePath,
    }, 3);

    // Enqueue thumbnail generation (medium priority)
    await enqueueJob('thumbnail', videoId, {
      inputPath,
      videoId,
      fileHash,
      rootKey: 'batch-process',
      relativePath,
    }, 5);

    console.log(`${progressStr} [ok] Enqueued jobs for: ${relativePath}`);
  } catch (e) {
    console.error(`${progressStr} [error] Failed for ${relativePath}:`, e.message);
  }
}

/**
 * Main
 */
async function main() {
  // Check if directory exists
  let stat;
  try {
    stat = await fs.stat(targetDir);
  } catch (e) {
    console.error(`[process] Directory not found: ${targetDir}`);
    process.exit(1);
  }

  if (!stat.isDirectory()) {
    console.error(`[process] Not a directory: ${targetDir}`);
    process.exit(1);
  }

  // Collect all video files
  console.log(`[process] Scanning directory: ${targetDir}`);
  const targets = [];
  for await (const f of walkDir(targetDir, '')) {
    targets.push(f);
  }

  if (targets.length === 0) {
    console.log(`[process] No video files found in ${targetDir}`);
    return;
  }

  console.log(`[process] Found ${targets.length} video(s). Concurrency=${options.concurrency}`);
  console.log(`[process] API endpoint: ${apiBase}`);

  // Process files with concurrency
  let index = 0;
  const total = targets.length;

  const runNext = async () => {
    while (index < total) {
      const i = index++;
      const t = targets[i];
      try {
        await processOne(t, i, total);
      } catch (err) {
        console.error(`[error] Unexpected failure for ${t.name}:`, err);
      }
    }
  };

  const workers = Array.from({ length: options.concurrency }, () => runNext());
  await Promise.all(workers);

  console.log(`[process] Done. Enqueued jobs for ${total} video(s).`);
  console.log(`[process] Check job status at: ${apiBase}/api/jobs/stats/summary`);
}

main().catch((e) => {
  console.error('[process] Unexpected error:', e?.stack || e?.message || e);
  process.exit(1);
});
