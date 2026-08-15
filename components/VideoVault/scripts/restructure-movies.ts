#!/usr/bin/env npx ts-node

/**
 * Movies Directory Restructure Script
 *
 * Transforms flat movie directory structure into folder-per-video organization.
 *
 * Before:
 *   movies/
 *   ├── Movie_Title_HD.mp4
 *   ├── Movie_Title_HD-thumb.jpg
 *   ├── Movie_Title_HD-sprite.jpg
 *
 * After:
 *   movies/
 *   ├── Movie_Title_HD/
 *   │   ├── Movie_Title_HD.mp4
 *   │   ├── thumbnail.jpg
 *   │   └── sprite.jpg
 *
 * Usage:
 *   npx ts-node scripts/restructure-movies.ts /path/to/movies --dry-run
 *   npx ts-node scripts/restructure-movies.ts /path/to/movies
 *
 * Options:
 *   --dry-run    Preview changes without making them
 *   --verbose    Show detailed progress
 *   --backup     Create backup directory before restructuring
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

// Video file extensions to process
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm', '.m4v'];

// Image extensions for thumbnails/sprites
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// Patterns to match thumbnail/sprite files
const THUMB_PATTERNS = ['-thumb', '-thumbnail', '_thumb', '_thumbnail', '.thumb'];
const SPRITE_PATTERNS = ['-sprite', '_sprite', '.sprite', '-spritesheet', '_spritesheet'];

interface FileGroup {
  videoPath: string;
  videoName: string;
  baseName: string;
  thumbnailPath?: string;
  spritePath?: string;
  targetDir: string;
}

interface MigrationPlan {
  groups: FileGroup[];
  skipped: string[];
  errors: string[];
  stats: {
    totalVideos: number;
    videosWithThumbnails: number;
    videosWithSprites: number;
    alreadyInFolders: number;
  };
}

interface MigrationOptions {
  dryRun: boolean;
  verbose: boolean;
  backup: boolean;
}

function log(message: string, _options: MigrationOptions) {
  console.log(message);
}

function verboseLog(message: string, options: MigrationOptions) {
  if (options.verbose) {
    console.log(`  ${message}`);
  }
}

function getBaseName(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

  // Remove common suffixes that indicate thumbnail/sprite
  let baseName = nameWithoutExt;
  for (const pattern of [...THUMB_PATTERNS, ...SPRITE_PATTERNS]) {
    if (baseName.toLowerCase().endsWith(pattern.toLowerCase())) {
      baseName = baseName.slice(0, -pattern.length);
      break;
    }
  }

  return baseName;
}

function isVideoFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function isThumbnailFile(filename: string): boolean {
  const nameLower = filename.toLowerCase();
  return THUMB_PATTERNS.some((p) => nameLower.includes(p.toLowerCase()));
}

function isSpriteFile(filename: string): boolean {
  const nameLower = filename.toLowerCase();
  return SPRITE_PATTERNS.some((p) => nameLower.includes(p.toLowerCase()));
}

function analyzeMigration(moviesDir: string, options: MigrationOptions): MigrationPlan {
  const plan: MigrationPlan = {
    groups: [],
    skipped: [],
    errors: [],
    stats: {
      totalVideos: 0,
      videosWithThumbnails: 0,
      videosWithSprites: 0,
      alreadyInFolders: 0,
    },
  };

  // Read all files in the directory
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(moviesDir, { withFileTypes: true });
  } catch (err) {
    plan.errors.push(`Failed to read directory: ${err}`);
    return plan;
  }

  // Separate files and directories
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  // Group video files with their associated thumbnails/sprites
  const videoFiles = files.filter(isVideoFile);
  const imageFiles = files.filter(isImageFile);

  // Build a map of base names to image files
  const imagesByBase = new Map<string, { thumbnails: string[]; sprites: string[] }>();
  for (const img of imageFiles) {
    const base = getBaseName(img);
    if (!imagesByBase.has(base)) {
      imagesByBase.set(base, { thumbnails: [], sprites: [] });
    }
    const entry = imagesByBase.get(base)!;
    if (isSpriteFile(img)) {
      entry.sprites.push(img);
    } else if (isThumbnailFile(img)) {
      entry.thumbnails.push(img);
    } else {
      // Could be a cover image - treat as thumbnail
      entry.thumbnails.push(img);
    }
  }

  // Process each video file
  for (const video of videoFiles) {
    const baseName = getBaseName(video);
    const videoPath = path.join(moviesDir, video);

    // Check if already in a folder (skip if parent folder matches video name)
    const parentDir = path.dirname(videoPath);
    const parentDirName = path.basename(parentDir);
    if (parentDirName === baseName || dirs.includes(baseName)) {
      plan.stats.alreadyInFolders++;
      plan.skipped.push(`${video} (already in folder or folder exists)`);
      continue;
    }

    plan.stats.totalVideos++;

    const group: FileGroup = {
      videoPath,
      videoName: video,
      baseName,
      targetDir: path.join(moviesDir, baseName),
    };

    // Find associated images
    const images = imagesByBase.get(baseName);
    if (images) {
      if (images.thumbnails.length > 0) {
        group.thumbnailPath = path.join(moviesDir, images.thumbnails[0]);
        plan.stats.videosWithThumbnails++;
      }
      if (images.sprites.length > 0) {
        group.spritePath = path.join(moviesDir, images.sprites[0]);
        plan.stats.videosWithSprites++;
      }
    }

    plan.groups.push(group);
  }

  return plan;
}

function executeMigration(plan: MigrationPlan, options: MigrationOptions): void {
  const { dryRun, verbose } = options;

  log(`\n${'='.repeat(60)}`, options);
  log(dryRun ? 'DRY RUN - No changes will be made' : 'EXECUTING MIGRATION', options);
  log(`${'='.repeat(60)}\n`, options);

  let successCount = 0;
  let errorCount = 0;

  for (const group of plan.groups) {
    log(`Processing: ${group.videoName}`, options);

    try {
      // Create target directory
      verboseLog(`Creating directory: ${group.targetDir}`, options);
      if (!dryRun) {
        fs.mkdirSync(group.targetDir, { recursive: true });
      }

      // Move video file
      const newVideoPath = path.join(group.targetDir, group.videoName);
      verboseLog(`Moving video to: ${newVideoPath}`, options);
      if (!dryRun) {
        fs.renameSync(group.videoPath, newVideoPath);
      }

      // Move and rename thumbnail
      if (group.thumbnailPath) {
        const thumbExt = path.extname(group.thumbnailPath);
        const newThumbPath = path.join(group.targetDir, `thumbnail${thumbExt}`);
        verboseLog(`Moving thumbnail to: ${newThumbPath}`, options);
        if (!dryRun) {
          fs.renameSync(group.thumbnailPath, newThumbPath);
        }
      }

      // Move and rename sprite
      if (group.spritePath) {
        const spriteExt = path.extname(group.spritePath);
        const newSpritePath = path.join(group.targetDir, `sprite${spriteExt}`);
        verboseLog(`Moving sprite to: ${newSpritePath}`, options);
        if (!dryRun) {
          fs.renameSync(group.spritePath, newSpritePath);
        }
      }

      successCount++;
      log(`  Success`, options);
    } catch (err) {
      errorCount++;
      log(`  Error: ${err}`, options);
    }
  }

  log(`\n${'='.repeat(60)}`, options);
  log('SUMMARY', options);
  log(`${'='.repeat(60)}`, options);
  log(`Total videos processed: ${plan.stats.totalVideos}`, options);
  log(`  - With thumbnails: ${plan.stats.videosWithThumbnails}`, options);
  log(`  - With sprites: ${plan.stats.videosWithSprites}`, options);
  log(`  - Already in folders: ${plan.stats.alreadyInFolders}`, options);
  log(`Successful: ${successCount}`, options);
  log(`Errors: ${errorCount}`, options);
  log(`Skipped: ${plan.skipped.length}`, options);

  if (dryRun) {
    log(`\nTo execute this migration, run without --dry-run`, options);
  }
}

function copyDirectoryRecursive(src: string, dest: string): void {
  // Create destination directory
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function createBackup(moviesDir: string, options: MigrationOptions): string | null {
  const backupDir = `${moviesDir}_backup_${Date.now()}`;

  log(`Creating backup at: ${backupDir}`, options);
  log(`Note: This may take a while for large directories...`, options);

  try {
    // Try using system cp command for better performance on Unix systems
    if (process.platform !== 'win32') {
      try {
        execFileSync('cp', ['-r', moviesDir, backupDir]);
        log(`Backup created successfully using system copy`, options);
        return backupDir;
      } catch {
        // Fall through to Node.js copy
      }
    }

    // Fallback to Node.js copy (works on all platforms)
    copyDirectoryRecursive(moviesDir, backupDir);
    log(`Backup created successfully`, options);
    return backupDir;
  } catch (err) {
    log(`Warning: Failed to create backup: ${err}`, options);
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);

  // Parse options
  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    backup: args.includes('--backup'),
  };

  // Get movies directory path
  const moviesDir = args.find((arg) => !arg.startsWith('--'));

  if (!moviesDir) {
    console.log(`
Movies Directory Restructure Script

Usage:
  npx ts-node scripts/restructure-movies.ts /path/to/movies [options]

Options:
  --dry-run    Preview changes without making them
  --verbose    Show detailed progress
  --backup     Create backup directory before restructuring

Examples:
  # Preview what will happen
  npx ts-node scripts/restructure-movies.ts /media/movies --dry-run --verbose

  # Execute with backup
  npx ts-node scripts/restructure-movies.ts /media/movies --backup

  # Execute without backup (use with caution)
  npx ts-node scripts/restructure-movies.ts /media/movies
`);
    process.exit(1);
  }

  // Verify directory exists
  if (!fs.existsSync(moviesDir)) {
    console.error(`Error: Directory does not exist: ${moviesDir}`);
    process.exit(1);
  }

  if (!fs.statSync(moviesDir).isDirectory()) {
    console.error(`Error: Path is not a directory: ${moviesDir}`);
    process.exit(1);
  }

  log(`\nMovies Restructure Script`, options);
  log(`${'='.repeat(60)}`, options);
  log(`Directory: ${moviesDir}`, options);
  log(`Options: ${JSON.stringify(options)}`, options);

  // Analyze the directory
  log(`\nAnalyzing directory structure...`, options);
  const plan = analyzeMigration(moviesDir, options);

  if (plan.errors.length > 0) {
    console.error(`\nErrors during analysis:`);
    plan.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  // Show plan summary
  log(`\nMigration Plan:`, options);
  log(`  Videos to process: ${plan.stats.totalVideos}`, options);
  log(`  Already in folders: ${plan.stats.alreadyInFolders}`, options);
  log(`  Skipped: ${plan.skipped.length}`, options);

  if (plan.stats.totalVideos === 0) {
    log(`\nNo videos to migrate.`, options);
    process.exit(0);
  }

  // Create backup if requested (and not dry run)
  if (options.backup && !options.dryRun) {
    const backupPath = createBackup(moviesDir, options);
    if (!backupPath) {
      console.error(`\nFailed to create backup. Aborting.`);
      process.exit(1);
    }
  }

  // Execute migration
  executeMigration(plan, options);
}

main();
