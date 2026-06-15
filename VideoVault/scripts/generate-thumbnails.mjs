#!/usr/bin/env node
// Generate 3 thumbnails (25/50/75%) for each .mp4 in a directory
// Usage:
//   node scripts/generate-thumbnails.mjs [directory] [--overwrite] [--concurrency=2] [--no-recursive]

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const [, , dirArg, ...restArgs] = process.argv;
const options = {
  overwrite: restArgs.includes('--overwrite'),
  recursive: !restArgs.includes('--no-recursive'),
  concurrency: (() => {
    const m = restArgs.join(' ').match(/--concurrency\s*=\s*(\d+)/);
    const val = m ? parseInt(m[1], 10) : 2;
    return Number.isFinite(val) && val > 0 ? val : 2;
  })(),
};

const root = process.cwd();
const defaultMediaRoot = process.env.MEDIA_ROOT || path.join(root, 'Processed');
const processedRoot = process.env.PROCESSED_DIR || process.env.PROCESSED_MEDIA_PATH || defaultMediaRoot;
const thumbnailsRoot = process.env.THUMBNAILS_DIR || (process.env.MEDIA_ROOT ? path.join(process.env.MEDIA_ROOT, 'Thumbnails') : path.join(defaultMediaRoot, 'Thumbnails'));
const targetDir = dirArg ? dirArg : defaultMediaRoot;

function cmdExists(cmd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, ['-version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0 || code === 1));
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve({ code, stdout: out.trim(), stderr: err.trim() });
      else
        reject(
          Object.assign(new Error(`${cmd} exited with code ${code}: ${err || out}`), {
            code,
            stdout: out,
            stderr: err,
          }),
        );
    });
  });
}

async function getDurationSeconds(filePath) {
  const args = [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ];
  const { stdout } = await run('ffprobe', args);
  const sec = parseFloat(stdout);
  if (!Number.isFinite(sec) || sec <= 0)
    throw new Error(`Invalid duration from ffprobe for ${filePath}: ${stdout}`);
  return sec;
}

function fmtSeconds(value) {
  return Math.max(0, value).toFixed(2);
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function isSubPath(parent, child) {
  if (!parent) return false;
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveThumbsDir(inputDir) {
  if (thumbnailsRoot && processedRoot && isSubPath(processedRoot, inputDir)) {
    const rel = path.relative(processedRoot, inputDir);
    return path.join(thumbnailsRoot, rel);
  }
  return path.join(inputDir, 'Thumbnails');
}

async function* walkDir(dir, base = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      const sub = path.join(dir, e.name);
      const subBase = path.join(base, e.name);
      yield* walkDir(sub, subBase);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.mp4')) {
      yield { dir, base, name: e.name };
    }
  }
}

async function listTargets(rootDir) {
  if (!options.recursive) {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.mp4'))
      .map((e) => ({ dir: rootDir, base: '', name: e.name }));
  }
  const out = [];
  for await (const f of walkDir(rootDir, '')) out.push(f);
  return out;
}

// Exported for server usage
export async function generateThumbnail(inputPath, options = {}) {
  const { overwrite = false } = options;
  const dir = path.dirname(inputPath);
  const name = path.basename(inputPath);
  const baseName = name.replace(/\.[^.]+$/, '');

  // Use central thumbnails directory for processed files when configured
  const thumbsDir = resolveThumbsDir(dir);
  await ensureDir(thumbsDir);

  const useProcessedNaming = processedRoot && isSubPath(processedRoot, dir);
  const spriteSuffix = useProcessedNaming ? '_sprite.jpg' : '-sprite.jpg';
  const thumbSuffix = useProcessedNaming ? '_thumb.jpg' : '-thumb.jpg';
  const spriteOut = path.join(thumbsDir, `${baseName}${spriteSuffix}`);
  const thumbOut = path.join(thumbsDir, `${baseName}${thumbSuffix}`);

  // Check if files exist
  let spriteExists = false;
  let thumbExists = false;
  try {
    await fs.access(spriteOut);
    spriteExists = true;
  } catch { }
  try {
    await fs.access(thumbOut);
    thumbExists = true;
  } catch { }

  if (spriteExists && thumbExists && !overwrite) {
    return { skipped: true, sprite: spriteOut, thumb: thumbOut };
  }

  const duration = await getDurationSeconds(inputPath);

  // 5x5 = 25 frames
  const fps = 25 / duration;

  const spriteArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-vf',
    `fps=${fps},scale=160:-1,tile=25x1`,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    spriteOut,
  ];

  if (overwrite) spriteArgs.unshift('-y');

  const thumbArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    fmtSeconds(duration * 0.5),
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    thumbOut,
  ];

  if (overwrite) thumbArgs.unshift('-y');

  // Run sprite generation
  await run('ffmpeg', spriteArgs);

  // Run thumbnail generation
  await run('ffmpeg', thumbArgs);

  return { skipped: false, sprite: spriteOut, thumb: thumbOut };
}

async function processOne(target, index, total) {
  const { dir, name } = target;
  const inputPath = path.join(dir, name);
  const progressStr = `[${index + 1}/${total}]`;

  try {
    console.log(`${progressStr} Processing: ${name}`);
    const result = await generateThumbnail(inputPath, options);
    if (result.skipped) {
      console.log(`${progressStr} [skip] ${name}`);
    } else {
      console.log(`${progressStr} [ok] Generated for ${name}`);
    }
  } catch (e) {
    console.error(`${progressStr} [error] Failed for ${name}:`, e.message);
  }
}

async function main() {
  const hasFfmpeg = await cmdExists('ffmpeg');
  const hasFfprobe = await cmdExists('ffprobe');
  if (!hasFfmpeg || !hasFfprobe) {
    console.error('[thumbs] ffmpeg or ffprobe not found in PATH. Please install ffmpeg.');
    process.exit(2);
  }

  let stat;
  try {
    stat = await fs.stat(targetDir);
  } catch (e) {
    console.error(`[thumbs] Directory not found: ${targetDir}`);
    process.exit(1);
  }
  if (!stat.isDirectory()) {
    console.error(`[thumbs] Not a directory: ${targetDir}`);
    process.exit(1);
  }

  const targets = await listTargets(targetDir);
  if (targets.length === 0) {
    console.log(
      `[thumbs] No .mp4 files found in ${targetDir}${options.recursive ? ' (recursive)' : ''}`,
    );
    return;
  }

  console.log(
    `[thumbs] Found ${targets.length} video(s) in ${targetDir}${options.recursive ? ' (recursive)' : ''}. Concurrency=${options.concurrency}`,
  );

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
  console.log(`[thumbs] Done. Processed ${total} file(s).`);
}

// Only run main if executed directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error('[thumbs] Unexpected error:', e?.stack || e?.message || e);
    process.exit(1);
  });
}
