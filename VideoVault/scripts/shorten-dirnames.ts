#!/usr/bin/env npx ts-node

/**
 * Shorten long movie directory names.
 *
 * Renames directories > MAX_LENGTH characters to a truncated version
 * (word-boundary aware). Renames the video file and thumbnails inside
 * to match. Updates metadata.json sidecar. Does NOT touch the database
 * — the server reconciles on next scan/startup.
 *
 * Usage:
 *   npx ts-node scripts/shorten-dirnames.ts /path/to/movies --dry-run
 *   npx ts-node scripts/shorten-dirnames.ts /path/to/movies
 */

import * as fs from 'fs';
import * as path from 'path';

const MAX_LENGTH = 60;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v']);

function shortenName(name: string): string {
  if (name.length <= MAX_LENGTH) return name;

  // Strip trailing quality/resolution tags before truncating (e.g., " HD", " 4K", " SD")
  let cleaned = name.replace(/\s+(HD|SD|4K|UHD|FHD)\s*(\(\d+\))?$/i, '');

  // If still too long after stripping quality tag, also strip any trailing " (N)" duplicate marker
  const dupMatch = cleaned.match(/^(.+?)\s*\(\d+\)$/);
  const dupSuffix = dupMatch ? '' : '';
  if (dupMatch) cleaned = dupMatch[1];

  if (cleaned.length <= MAX_LENGTH) {
    return cleaned + dupSuffix;
  }

  // Truncate on word boundary
  let truncated = cleaned.slice(0, MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > MAX_LENGTH * 0.5) {
    truncated = truncated.slice(0, lastSpace);
  }
  // Remove trailing punctuation/whitespace
  truncated = truncated.replace(/[\s\-_.,]+$/, '');
  return truncated;
}

function readJsonSafe(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJsonSafe(filePath: string, data: any): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const moviesDir = args.find(a => !a.startsWith('--'));

  if (!moviesDir) {
    console.error('Usage: npx ts-node scripts/shorten-dirnames.ts /path/to/movies [--dry-run]');
    process.exit(1);
  }

  if (!fs.existsSync(moviesDir)) {
    console.error(`Directory not found: ${moviesDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(moviesDir, { withFileTypes: true });
  const longDirs = entries
    .filter(e => e.isDirectory() && e.name.length > MAX_LENGTH)
    .sort((a, b) => b.name.length - a.name.length);

  console.log(`Found ${longDirs.length} directories exceeding ${MAX_LENGTH} chars`);
  if (dryRun) console.log('DRY RUN — no changes will be made\n');

  let renamed = 0;
  let skipped = 0;
  let errors = 0;

  for (const dir of longDirs) {
    const oldName = dir.name;
    let newName = shortenName(oldName);

    // Ensure no collision
    let candidate = newName;
    let suffix = 1;
    while (candidate !== oldName && fs.existsSync(path.join(moviesDir, candidate))) {
      suffix++;
      candidate = `${newName} (${suffix})`;
    }
    newName = candidate;

    if (newName === oldName) {
      skipped++;
      continue;
    }

    const oldDirPath = path.join(moviesDir, oldName);
    const newDirPath = path.join(moviesDir, newName);

    console.log(`  ${oldName.length}ch → ${newName.length}ch`);
    console.log(`    ${oldName}`);
    console.log(`  → ${newName}`);

    if (dryRun) {
      renamed++;
      continue;
    }

    try {
      // Find the video file inside
      const contents = fs.readdirSync(oldDirPath, { withFileTypes: true });
      const videoFile = contents.find(
        e => e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase()),
      );

      if (videoFile) {
        const ext = path.extname(videoFile.name);
        const oldBaseName = path.basename(videoFile.name, ext);
        const newVideoName = `${newName}${ext}`;

        // Rename thumbnails first (before dir rename)
        const thumbsDir = path.join(oldDirPath, 'Thumbnails');
        if (fs.existsSync(thumbsDir)) {
          for (const suffix of ['_thumb.jpg', '_sprite.jpg']) {
            const oldThumb = path.join(thumbsDir, `${oldBaseName}${suffix}`);
            const newThumb = path.join(thumbsDir, `${newName}${suffix}`);
            if (fs.existsSync(oldThumb)) {
              fs.renameSync(oldThumb, newThumb);
            }
          }
        }

        // Rename the video file
        const oldVideoPath = path.join(oldDirPath, videoFile.name);
        const newVideoPath = path.join(oldDirPath, newVideoName);
        if (oldVideoPath !== newVideoPath) {
          fs.renameSync(oldVideoPath, newVideoPath);
        }
      }

      // Update metadata.json — preserve full title in displayName and originalFilename
      const sidecarPath = path.join(oldDirPath, 'metadata.json');
      const sidecar = readJsonSafe(sidecarPath);
      if (sidecar) {
        // Keep displayName as-is (full title); update filename to match shortened name
        if (videoFile) {
          const ext = path.extname(videoFile.name);
          sidecar.filename = `${newName}${ext}`;
        }
        // Preserve originalFilename if not set
        if (!sidecar.originalFilename && videoFile) {
          sidecar.originalFilename = videoFile.name;
        }
        writeJsonSafe(sidecarPath, sidecar);
      }

      // Rename the directory itself (last, so inner renames use old path)
      fs.renameSync(oldDirPath, newDirPath);

      renamed++;
      console.log(`    ✓ done`);
    } catch (err: any) {
      errors++;
      console.error(`    ✗ error: ${err.message}`);
    }
  }

  console.log(`\nSummary: ${renamed} renamed, ${skipped} skipped, ${errors} errors`);
}

main();
