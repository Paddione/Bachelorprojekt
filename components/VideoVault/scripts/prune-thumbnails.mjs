#!/usr/bin/env node
/**
 * Remove thumbnails/sprites that do not have a matching video file.
 *
 * Usage:
 *   node scripts/prune-thumbnails.mjs [--delete] [--no-recursive]
 *   # default is dry-run (no deletion)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--delete');
const recursive = !args.has('--no-recursive');

const PROCESSED_DIR =
  process.env.PROCESSED_DIR || process.env.PROCESSED_MEDIA_PATH || path.join(process.cwd(), 'Processed');
const THUMBNAILS_DIR = process.env.THUMBNAILS_DIR || path.join(PROCESSED_DIR, 'Thumbnails');

const VIDEO_EXTS = new Set(['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm', '.m4v']);
const THUMB_SUFFIXES = ['_thumb.jpg', '_sprite.jpg', '-thumb.jpg', '-sprite.jpg'];

function normalizeRel(p) {
  return p.split(path.sep).join('/');
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        yield* walk(fullPath);
      }
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

async function collectVideoBases() {
  const relBases = new Set();
  const baseNames = new Set();

  for await (const filePath of walk(PROCESSED_DIR)) {
    const ext = path.extname(filePath).toLowerCase();
    if (!VIDEO_EXTS.has(ext)) continue;
    const rel = normalizeRel(path.relative(PROCESSED_DIR, filePath));
    const relBase = rel.slice(0, -ext.length);
    relBases.add(relBase);
    baseNames.add(path.basename(relBase));
  }

  return { relBases, baseNames };
}

function stripThumbSuffix(relPath) {
  const lower = relPath.toLowerCase();
  for (const suffix of THUMB_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return relPath.slice(0, -suffix.length);
    }
  }
  return null;
}

async function main() {
  try {
    await fs.access(PROCESSED_DIR);
  } catch {
    console.error(`[prune] Processed directory not found: ${PROCESSED_DIR}`);
    process.exit(1);
  }
  try {
    await fs.access(THUMBNAILS_DIR);
  } catch {
    console.error(`[prune] Thumbnails directory not found: ${THUMBNAILS_DIR}`);
    process.exit(1);
  }

  const { relBases, baseNames } = await collectVideoBases();
  console.log(`[prune] Found ${relBases.size} video(s) in ${PROCESSED_DIR}`);

  let total = 0;
  let orphaned = 0;
  let removed = 0;

  for await (const thumbPath of walk(THUMBNAILS_DIR)) {
    const rel = normalizeRel(path.relative(THUMBNAILS_DIR, thumbPath));
    const relBase = stripThumbSuffix(rel);
    if (!relBase) continue;
    total++;

    const relMatch = relBases.has(relBase);
    const baseMatch = baseNames.has(path.basename(relBase));

    if (relMatch || baseMatch) continue;
    orphaned++;

    if (dryRun) {
      console.log(`[dry-run] remove ${thumbPath}`);
      continue;
    }

    try {
      await fs.unlink(thumbPath);
      removed++;
      console.log(`[removed] ${thumbPath}`);
    } catch (err) {
      console.warn(`[warn] failed to remove ${thumbPath}: ${err.message || err}`);
    }
  }

  console.log(
    `[prune] Checked ${total} thumbnail/sprite file(s). Orphaned: ${orphaned}. ${dryRun ? 'Dry run only.' : `Removed: ${removed}.`}`,
  );
}

main().catch((err) => {
  console.error('[prune] Unexpected error:', err?.stack || err?.message || err);
  process.exit(1);
});
