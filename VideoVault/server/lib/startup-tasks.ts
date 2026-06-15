import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { eq, and, isNotNull } from 'drizzle-orm';
import { videos, directoryRoots } from '@shared/schema';
import { logger } from './logger';
import { MOVIE_EXTENSIONS, extractMovieMetadata, detectQualityCategories, generateMovieThumbnail, parseMovieFilename, generateOrganizedPath } from '../handlers/movie-handler';
import { readSidecar, writeSidecar } from './sidecar';
import { extractCategoriesFromPath, mergeCategories } from '@shared/category-extractor';
import { generateVideoIdSync } from '@shared/video-id';

// Track filenames that failed stat (encoding issues on SMB) — warn only once
const _failedStatNames = new Set<string>();

/**
 * Run all startup tasks for the movies library.
 *
 * Handles two layouts:
 * - Flat: video files directly in MOVIES_DIR/, thumbnails in MOVIES_DIR/Thumbnails/
 * - Subdirectory: video in subdir/video.mp4, thumbnails in subdir/Thumbnails/,
 *   metadata in subdir/metadata.json
 *
 * 1. Ensure 1_inbox and Thumbnails directories exist
 * 2. Drain inbox: move files from 1_inbox/ to MOVIES_DIR/
 * 3. Generate missing thumbnails/sprites for flat files in MOVIES_DIR/
 * 4. Auto-index all videos (flat + subdirectory) into DB
 */
export async function runStartupTasks(db: any): Promise<void> {
  const MOVIES_DIR = process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');

  try {
    await fs.access(MOVIES_DIR);
  } catch {
    logger.warn('[StartupTasks] MOVIES_DIR not accessible, skipping startup tasks', { directory: MOVIES_DIR });
    return;
  }

  // 1. Ensure required directories exist
  const thumbsDir = path.join(MOVIES_DIR, 'Thumbnails');
  const inboxDir = path.join(MOVIES_DIR, '1_inbox');
  await fs.mkdir(thumbsDir, { recursive: true }).catch(() => {});
  await fs.mkdir(inboxDir, { recursive: true }).catch(() => {});
  if (process.env.INBOX_DIR) {
    await fs.mkdir(process.env.INBOX_DIR, { recursive: true }).catch(() => {});
  }
  logger.info('[StartupTasks] Directories ensured', { moviesDir: MOVIES_DIR, inboxDir: process.env.INBOX_DIR || inboxDir });

  // 2. Register 'movies' root in DB so indexed videos survive startup cleanup.
  //    Retry briefly — the DB may still be recovering from the startup TRUNCATE.
  if (db) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ok = await ensureMoviesRoot(db, MOVIES_DIR);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // 3. Drain inbox → move files to MOVIES_DIR root
  await drainInbox(MOVIES_DIR);

  // 3b. Organize any flat files in MOVIES_DIR root into subdirectories
  await organizeFlatFiles(MOVIES_DIR);

  // 4. Index all videos with existing thumbnails into DB (fast — no ffmpeg)
  if (db) {
    await autoIndexLibrary(db, MOVIES_DIR);
  }

  // 5. Write movies_index.json — uses DB if available, falls back to filesystem scan
  //    Retry since DB may still be recovering from the mass upserts above.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await generateMoviesIndex(db, MOVIES_DIR);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // 6. Generate missing thumbnails for flat AND subdirectory files (slow — runs last)
  await generateMissingThumbnails(MOVIES_DIR);
  await generateMissingSubdirThumbnails(MOVIES_DIR);

  // 7. Clean up empty directories (no video content)
  try {
    const { cleanupEmptyDirectories } = await import('../handlers/movie-handler');
    const removed = await cleanupEmptyDirectories(MOVIES_DIR);
    if (removed > 0) {
      logger.info('[StartupTasks] Cleaned up empty directories', { removed });
    }
  } catch (err: any) {
    logger.warn('[StartupTasks] Empty directory cleanup failed', { error: err.message });
  }

  // 8. Re-index newly generated thumbnails and rebuild movies_index.json
  if (db) {
    await autoIndexLibrary(db, MOVIES_DIR);
    try {
      await generateMoviesIndex(db, MOVIES_DIR);
    } catch { /* non-fatal */ }
  }
}

/**
 * Move all video files from inbox directories into MOVIES_DIR/.
 * Checks both MOVIES_DIR/1_inbox/ and INBOX_DIR (if set and different).
 * Exported so the movie watcher can call it on each scan cycle too.
 */
export async function drainInbox(moviesDir: string): Promise<number> {
  const builtInInbox = path.join(moviesDir, '1_inbox');
  const externalInbox = process.env.INBOX_DIR;

  let total = 0;
  total += await drainSingleInbox(builtInInbox, moviesDir);
  if (externalInbox && path.resolve(externalInbox) !== path.resolve(builtInInbox)) {
    total += await drainSingleInbox(externalInbox, moviesDir);
  }
  return total;
}

async function drainSingleInbox(inboxDir: string, moviesDir: string): Promise<number> {

  let filenames: string[];
  try {
    filenames = await fs.readdir(inboxDir);
  } catch {
    return 0;
  }

  const videoFilenames = filenames.filter(
    (name) => MOVIE_EXTENSIONS.includes(path.extname(name).toLowerCase()),
  );

  if (videoFilenames.length === 0) return 0;

  let moved = 0;
  for (const name of videoFilenames) {
    const src = path.join(inboxDir, name);
    const dest = path.join(moviesDir, name);

    // Verify it's actually a file
    let srcStat;
    try {
      srcStat = await fs.stat(src);
      if (!srcStat.isFile()) continue;
    } catch {
      if (!_failedStatNames.has(name)) {
        _failedStatNames.add(name);
        logger.warn(`[StartupTasks] Inbox skip: cannot stat ${name} (SMB encoding issue? will not retry)`);
      }
      continue;
    }

    // If destination already exists at root, check same-size duplicate.
    try {
      const destStat = await fs.stat(dest);
      if (destStat.size === srcStat.size) {
        try {
          await fs.unlink(src);
          logger.info(`[StartupTasks] Inbox cleanup: removed duplicate ${name} (same size as destination)`);
        } catch (unlinkErr: any) {
          logger.warn(`[StartupTasks] Inbox cleanup: failed to remove duplicate ${name}`, { error: unlinkErr.message });
        }
      }
      continue;
    } catch { /* good — doesn't exist at destination */ }

    // Check if an organized subdirectory already contains this file
    // (e.g., inbox file re-dropped after it was already organized)
    const { title, year } = parseMovieFilename(name);
    const organizedFolder = generateOrganizedPath(title, year);
    const organizedDir = path.join(moviesDir, organizedFolder);
    try {
      const dirEntries = await fs.readdir(organizedDir);
      const hasVideo = dirEntries.some(
        (e: string) => MOVIE_EXTENSIONS.includes(path.extname(e).toLowerCase()),
      );
      if (hasVideo) {
        // Already organized — remove inbox duplicate
        try {
          await fs.unlink(src);
          logger.info(`[StartupTasks] Inbox cleanup: removed ${name} (already organized in ${organizedFolder}/)`);
        } catch (unlinkErr: any) {
          logger.warn(`[StartupTasks] Inbox cleanup: failed to remove ${name}`, { error: unlinkErr.message });
        }
        continue;
      }
    } catch { /* dir doesn't exist — proceed with move */ }

    try {
      await fs.rename(src, dest);
      moved++;
    } catch (err: any) {
      if (err.code === 'EXDEV') {
        try {
          await fs.copyFile(src, dest);
          await fs.unlink(src);
          moved++;
        } catch (copyErr: any) {
          logger.warn(`[StartupTasks] Inbox copy failed: ${name}`, { error: copyErr.message });
        }
      } else {
        logger.warn(`[StartupTasks] Inbox move failed: ${name}`, { error: err.message });
      }
    }
  }

  if (moved > 0) {
    logger.info(`[StartupTasks] Inbox drained: ${moved} files moved to movies root`);
  }
  return moved;
}

/**
 * Move flat video files from MOVIES_DIR/ root into organized subdirectories.
 * Handles files that were processed with AUTO_ORGANIZE=0 and left flat.
 * Moves any root-level thumbnails into the new subdirectory's Thumbnails/ folder.
 */
async function organizeFlatFiles(moviesDir: string): Promise<void> {
  const rootThumbsDir = path.join(moviesDir, 'Thumbnails');

  let entries;
  try {
    entries = await fs.readdir(moviesDir, { withFileTypes: true });
  } catch {
    return;
  }

  const flatVideos = entries.filter(
    (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
  );

  if (flatVideos.length === 0) return;

  let organized = 0;
  for (const entry of flatVideos) {
    const srcPath = path.join(moviesDir, entry.name);
    const { title, year } = parseMovieFilename(entry.name);
    const folderName = generateOrganizedPath(title, year);
    const ext = path.extname(entry.name);
    const organizedFilename = `${folderName}${ext}`;
    const targetDir = path.join(moviesDir, folderName);
    const targetPath = path.join(targetDir, organizedFilename);

    // If target directory already exists, check if it already has a video file.
    // If so, the flat file is a duplicate — remove it instead of skipping.
    try {
      await fs.access(targetDir);
      const dirContents = await fs.readdir(targetDir);
      const hasVideo = dirContents.some(
        (e: string) => MOVIE_EXTENSIONS.includes(path.extname(e).toLowerCase()),
      );
      if (hasVideo) {
        // Already organized — remove the flat duplicate
        try {
          await fs.unlink(srcPath);
          organized++;
          logger.info(`[StartupTasks] Removed flat duplicate: ${entry.name} (already in ${folderName}/)`);
        } catch (err: any) {
          logger.warn(`[StartupTasks] Failed to remove flat duplicate: ${entry.name}`, { error: err.message });
        }
      }
      continue;
    } catch { /* good — doesn't exist, proceed with organize */ }

    try {
      const thumbsDir = path.join(targetDir, 'Thumbnails');
      await fs.mkdir(thumbsDir, { recursive: true });

      // Move video file
      await fs.rename(srcPath, targetPath);

      // Move root-level thumbnails if they exist
      const baseName = path.basename(entry.name, ext);
      for (const suffix of ['_thumb.jpg', '_sprite.jpg']) {
        const oldThumb = path.join(rootThumbsDir, `${baseName}${suffix}`);
        const newThumb = path.join(thumbsDir, `${folderName}${suffix}`);
        try {
          await fs.access(oldThumb);
          await fs.rename(oldThumb, newThumb);
        } catch { /* no thumbnail to move */ }
      }

      // Write metadata.json sidecar
      await writeSidecar(targetDir, {
        version: 1,
        filename: organizedFilename,
        originalFilename: entry.name,
        displayName: title + (year ? ` (${year})` : ''),
      });

      organized++;
    } catch (err: any) {
      logger.warn(`[StartupTasks] Failed to organize flat file: ${entry.name}`, { error: err.message });
    }
  }

  if (organized > 0) {
    logger.info(`[StartupTasks] Organized ${organized} flat files into subdirectories`);
  }
}

/**
 * Ensure the 'movies' rootKey exists in directory_roots so that videos
 * indexed with rootKey='movies' survive the startup cleanup
 * (which deletes videos whose rootKey isn't in the directory_roots table).
 */
async function ensureMoviesRoot(db: any, moviesDir: string): Promise<boolean> {
  if (!db) return false;
  try {
    await db
      .insert(directoryRoots)
      .values({
        rootKey: 'movies',
        name: 'movies',
        directories: [moviesDir],
      })
      .onConflictDoUpdate({
        target: directoryRoots.rootKey,
        set: {
          directories: [moviesDir],
          updatedAt: new Date(),
        },
      });
    logger.info('[StartupTasks] Registered movies root', { rootKey: 'movies', path: moviesDir });
    return true;
  } catch (err: any) {
    logger.warn('[StartupTasks] Failed to register movies root (will retry)', { error: err.message });
    return false;
  }
}

/**
 * For each video file directly in MOVIES_DIR/ that is missing a
 * thumbnail or sprite in MOVIES_DIR/Thumbnails/, generate them.
 */
async function generateMissingThumbnails(moviesDir: string): Promise<void> {
  const thumbsDir = path.join(moviesDir, 'Thumbnails');

  let entries;
  try {
    entries = await fs.readdir(moviesDir, { withFileTypes: true });
  } catch {
    return;
  }

  const videoFiles = entries.filter(
    (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
  );

  let generated = 0;
  let failed = 0;

  for (const entry of videoFiles) {
    const baseName = path.basename(entry.name, path.extname(entry.name));
    const thumbPath = path.join(thumbsDir, `${baseName}_thumb.jpg`);
    const spritePath = path.join(thumbsDir, `${baseName}_sprite.jpg`);

    let hasThumb = false;
    let hasSprite = false;
    try { await fs.access(thumbPath); hasThumb = true; } catch { /* */ }
    try { await fs.access(spritePath); hasSprite = true; } catch { /* */ }

    if (hasThumb && hasSprite) continue;

    const videoPath = path.join(moviesDir, entry.name);
    try {
      await generateMovieThumbnail(videoPath, thumbsDir);
      generated++;
      logger.info(`[StartupTasks] Generated thumbnails for ${entry.name}`);
    } catch (err: any) {
      failed++;
      logger.warn(`[StartupTasks] Thumbnail generation failed for ${entry.name}`, { error: err.message });
    }
  }

  if (generated > 0 || failed > 0) {
    logger.info('[StartupTasks] Thumbnail generation complete', { generated, failed });
  }
}

/**
 * For each subdirectory in MOVIES_DIR that contains a video file
 * but is missing thumbnails/sprites, generate them via ffmpeg.
 */
async function generateMissingSubdirThumbnails(moviesDir: string): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(moviesDir, { withFileTypes: true });
  } catch {
    return;
  }

  const SKIP_DIRS = new Set(['Thumbnails', '1_inbox', '2_processing', '3_complete']);
  const subdirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name));

  let generated = 0;
  let failed = 0;

  for (const dirEntry of subdirs) {
    const dir = path.join(moviesDir, dirEntry.name);

    let dirFiles;
    try {
      dirFiles = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const videoFile = dirFiles.find(
      (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
    );
    if (!videoFile) continue;

    const baseName = path.basename(videoFile.name, path.extname(videoFile.name));
    const thumbsDir = path.join(dir, 'Thumbnails');
    const thumbPath = path.join(thumbsDir, `${baseName}_thumb.jpg`);
    const spritePath = path.join(thumbsDir, `${baseName}_sprite.jpg`);

    let hasThumb = false;
    let hasSprite = false;
    try { await fs.access(thumbPath); hasThumb = true; } catch { /* */ }
    try { await fs.access(spritePath); hasSprite = true; } catch { /* */ }

    if (hasThumb && hasSprite) continue;

    const videoPath = path.join(dir, videoFile.name);
    try {
      await fs.mkdir(thumbsDir, { recursive: true });
      await generateMovieThumbnail(videoPath, thumbsDir);
      generated++;
      logger.info(`[StartupTasks] Generated subdirectory thumbnails for ${dirEntry.name}/${videoFile.name}`);
    } catch (err: any) {
      failed++;
      if (failed <= 5) {
        logger.warn(`[StartupTasks] Subdirectory thumbnail generation failed for ${dirEntry.name}`, { error: err.message });
      }
    }
  }

  if (generated > 0 || failed > 0) {
    logger.info('[StartupTasks] Subdirectory thumbnail generation complete', { generated, failed });
  }
}

/**
 * Find the first *_thumb.jpg file in a Thumbnails directory.
 * Returns the base name (before _thumb.jpg) or null if none found.
 */
async function findThumbInDir(thumbsDir: string): Promise<{ thumbName: string; thumbFile: string } | null> {
  try {
    const files = await fs.readdir(thumbsDir);
    const thumbFile = files.find((f) => f.endsWith('_thumb.jpg'));
    if (thumbFile) {
      const thumbName = thumbFile.replace(/_thumb\.jpg$/, '');
      return { thumbName, thumbFile };
    }
  } catch { /* dir doesn't exist or can't be read */ }
  return null;
}

/**
 * Index all videos into the DB. Handles two layouts:
 *
 * 1. Flat files: MOVIES_DIR/video.mp4 + MOVIES_DIR/Thumbnails/video_thumb.jpg
 * 2. Subdirectory: MOVIES_DIR/subdir/video.mp4 + MOVIES_DIR/subdir/Thumbnails/*_thumb.jpg
 *    (thumbnail name may differ from video filename — use whatever _thumb.jpg exists)
 *    Reads metadata.json sidecar for displayName, categories, metadata.
 */
async function autoIndexLibrary(db: any, moviesDir: string): Promise<void> {
  if (!db) return;

  let entries;
  try {
    entries = await fs.readdir(moviesDir, { withFileTypes: true });
  } catch {
    return;
  }

  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  // --- Pass 1: Flat files at root level ---
  const rootThumbsDir = path.join(moviesDir, 'Thumbnails');
  const flatFiles = entries.filter(
    (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
  );

  for (const entry of flatFiles) {
    try {
      const baseName = path.basename(entry.name, path.extname(entry.name));
      const thumbPath = path.join(rootThumbsDir, `${baseName}_thumb.jpg`);
      const spritePath = path.join(rootThumbsDir, `${baseName}_sprite.jpg`);

      let hasThumb = false;
      let hasSprite = false;
      try { await fs.access(thumbPath); hasThumb = true; } catch { /* */ }
      try { await fs.access(spritePath); hasSprite = true; } catch { /* */ }

      if (!hasThumb || !hasSprite) {
        skipped++;
        continue;
      }

      const id = generateVideoIdSync(crypto, 'movies', entry.name);
      const videoPath = path.join(moviesDir, entry.name);
      const stat = await fs.stat(videoPath);
      const thumbUrl = `/media/movies/Thumbnails/${encodeURIComponent(baseName)}_thumb.jpg`;

      let metadata = { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' };
      try {
        const probed = await extractMovieMetadata(videoPath);
        metadata = {
          duration: probed.duration || 0, width: probed.width || 0, height: probed.height || 0,
          bitrate: probed.bitrate || 0, codec: probed.codec || '', fps: probed.fps || 0,
          aspectRatio: probed.aspectRatio || '',
        };
      } catch { /* proceed without */ }

      const qualities = detectQualityCategories(metadata);
      const extracted = extractCategoriesFromPath(entry.name);
      const categories = mergeCategories(defaultCategories(qualities), extracted);
      await upsertVideo(db, {
        id, filename: entry.name, displayName: baseName,
        dbPath: `movies/${entry.name}`, stat, metadata, thumbUrl,
        categories, customCategories: {},
      });
      indexed++;
    } catch (err: any) {
      errors++;
    }
  }

  // --- Pass 2: Subdirectory movies (sequential to avoid DB pool exhaustion) ---
  const SKIP_DIRS = new Set(['Thumbnails', '1_inbox', '2_processing', '3_complete']);
  const subdirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name));

  for (const dirEntry of subdirs) {
    try {
      const dir = path.join(moviesDir, dirEntry.name);

      let dirFiles;
      try {
        dirFiles = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        skipped++;
        continue; // Can't read dir (encoding issue)
      }

      const videoFile = dirFiles.find(
        (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
      );
      if (!videoFile) { skipped++; continue; }

      const thumbsDir = path.join(dir, 'Thumbnails');
      const thumbInfo = await findThumbInDir(thumbsDir);
      if (!thumbInfo) { skipped++; continue; }

      const relVideoPath = path.join(dirEntry.name, videoFile.name);
      const id = generateVideoIdSync(crypto, 'movies', relVideoPath);

      const videoPath = path.join(dir, videoFile.name);
      const stat = await fs.stat(videoPath);

      const sidecar = await readSidecar(dir);
      const displayName = sidecar?.displayName || path.basename(videoFile.name, path.extname(videoFile.name));
      const thumbUrl = `/media/movies/${encodeURIComponent(dirEntry.name)}/Thumbnails/${encodeURIComponent(thumbInfo.thumbFile)}`;

      let metadata = sidecar?.metadata || { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' };
      if (!sidecar?.metadata) {
        try {
          const probed = await extractMovieMetadata(videoPath);
          metadata = {
            duration: probed.duration || 0, width: probed.width || 0, height: probed.height || 0,
            bitrate: probed.bitrate || 0, codec: probed.codec || '', fps: probed.fps || 0,
            aspectRatio: probed.aspectRatio || '',
          };
        } catch { /* proceed without */ }
      }

      const sidecarCategories = sidecar?.categories || {};
      const qualities = detectQualityCategories(metadata);
      // Extract from both filename and directory name, then merge with sidecar
      const extracted = extractCategoriesFromPath(videoFile.name, dirEntry.name);
      const base = mergeCategories(defaultCategories(qualities), extracted);
      const categories = mergeCategories(base, sidecarCategories as any);

      const customCategories = sidecar?.customCategories || {};
      await upsertVideo(db, {
        id, filename: videoFile.name, displayName,
        dbPath: `movies/${relVideoPath}`, stat, metadata, thumbUrl,
        categories, customCategories,
      });

      // Write enriched data back to sidecar so it stays in sync
      await writeSidecar(dir, {
        version: 1, id,
        filename: videoFile.name, displayName,
        size: stat.size, lastModified: stat.mtime.toISOString(),
        metadata, categories: categories as any, customCategories,
      });
      indexed++;
    } catch (err: any) {
      errors++;
      if (errors <= 3) {
        logger.warn('[StartupTasks] Subdir index error', { dir: dirEntry.name, error: err.message });
      }
    }
  }

  if (indexed > 0 || errors > 0) {
    logger.info('[StartupTasks] Auto-index complete', { indexed, skipped, errors });
  } else {
    logger.info('[StartupTasks] Auto-index: library up to date', { skipped });
  }
}

/**
 * Write movies_index.json next to MOVIES_DIR (in MEDIA_ROOT).
 * Contains all completed videos with thumbnails — same shape as GET /api/videos.
 * Exported so it can be called after the movie watcher processes new files.
 */
export async function generateMoviesIndex(db: any, moviesDir?: string): Promise<void> {
  const MOVIES_DIR = moviesDir || process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');
  const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
  const indexPath = path.join(MEDIA_ROOT, 'movies_index.json');

  // Try DB-based generation first
  if (db) {
    try {
      const rows = await db
        .select()
        .from(videos)
        .where(
          and(
            isNotNull(videos.thumbnail),
            eq(videos.processingStatus, 'completed'),
          ),
        );

      if (rows.length > 0) {
        await fs.writeFile(indexPath, JSON.stringify(rows), 'utf-8');
        logger.info('[StartupTasks] Generated movies_index.json from DB', { count: rows.length, path: indexPath });
        return;
      }
    } catch (err: any) {
      logger.warn('[StartupTasks] DB query failed, falling back to filesystem scan', { error: err.message });
    }
  }

  // Fallback: scan filesystem using metadata.json sidecars
  try {
    const entries = await fs.readdir(MOVIES_DIR, { withFileTypes: true });
    const result: any[] = [];

    // Pass 1: flat files in MOVIES_DIR/
    const rootThumbsDir = path.join(MOVIES_DIR, 'Thumbnails');
    const flatFiles = entries.filter(
      (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
    );

    for (const entry of flatFiles) {
      const baseName = path.basename(entry.name, path.extname(entry.name));
      const thumbPath = path.join(rootThumbsDir, `${baseName}_thumb.jpg`);
      try { await fs.access(thumbPath); } catch { continue; }

      const videoPath = path.join(MOVIES_DIR, entry.name);
      const stat = await fs.stat(videoPath);
      const id = generateVideoIdSync(crypto, 'movies', entry.name);
      const thumbUrl = `/media/movies/Thumbnails/${encodeURIComponent(baseName)}_thumb.jpg`;

      result.push({
        id, filename: entry.name, displayName: baseName,
        path: `movies/${entry.name}`, size: stat.size,
        lastModified: stat.mtime.toISOString(),
        metadata: { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' },
        categories: defaultCategories([]),
        customCategories: {},
        thumbnail: { generated: true, dataUrl: thumbUrl, timestamp: new Date().toISOString() },
        rootKey: 'movies', processingStatus: 'completed',
      });
    }

    // Pass 2: subdirectory movies with metadata.json sidecars
    const SKIP_DIRS = new Set(['Thumbnails', '1_inbox', '2_processing', '3_complete']);
    const subdirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name));

    for (const dirEntry of subdirs) {
      try {
        const dir = path.join(MOVIES_DIR, dirEntry.name);
        const dirFiles = await fs.readdir(dir, { withFileTypes: true });
        const videoFile = dirFiles.find(
          (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
        );
        if (!videoFile) continue;

        const thumbsDir = path.join(dir, 'Thumbnails');
        const thumbInfo = await findThumbInDir(thumbsDir);
        if (!thumbInfo) continue;

        const relVideoPath = path.join(dirEntry.name, videoFile.name);
        const videoPath = path.join(dir, videoFile.name);
        const stat = await fs.stat(videoPath);

        // Read metadata.json sidecar if available
        const sidecar = await readSidecar(dir);
        const id = sidecar?.id
          || generateVideoIdSync(crypto, 'movies', relVideoPath);
        const displayName = sidecar?.displayName
          || path.basename(videoFile.name, path.extname(videoFile.name));
        const thumbUrl = `/media/movies/${encodeURIComponent(dirEntry.name)}/Thumbnails/${encodeURIComponent(thumbInfo.thumbFile)}`;
        const metadata = sidecar?.metadata
          || { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' };
        const categories = sidecar?.categories || defaultCategories([]);
        const customCategories = sidecar?.customCategories || {};

        result.push({
          id, filename: videoFile.name, displayName,
          path: `movies/${relVideoPath}`, size: stat.size,
          lastModified: stat.mtime.toISOString(),
          metadata, categories, customCategories,
          thumbnail: { generated: true, dataUrl: thumbUrl, timestamp: new Date().toISOString() },
          rootKey: 'movies', processingStatus: 'completed',
        });
      } catch {
        // Skip unreadable subdirectories
      }
    }

    await fs.writeFile(indexPath, JSON.stringify(result), 'utf-8');
    logger.info('[StartupTasks] Generated movies_index.json from filesystem', { count: result.length, path: indexPath });
  } catch (err: any) {
    logger.warn('[StartupTasks] Failed to generate movies_index.json from filesystem', { error: err.message });
  }
}

function defaultCategories(qualities: string[]) {
  return {
    age: [] as string[], physical: [] as string[], ethnicity: [] as string[],
    relationship: [] as string[], acts: [] as string[], setting: [] as string[],
    quality: qualities, performer: [] as string[],
  };
}

async function upsertVideo(db: any, v: {
  id: string; filename: string; displayName: string; dbPath: string;
  stat: { size: number; mtime: Date }; metadata: any; thumbUrl: string;
  categories: any; customCategories: any;
}) {
  await db
    .insert(videos)
    .values({
      id: v.id, filename: v.filename, displayName: v.displayName,
      path: v.dbPath, size: v.stat.size, lastModified: v.stat.mtime,
      metadata: v.metadata, categories: v.categories, customCategories: v.customCategories,
      thumbnail: { generated: true, dataUrl: v.thumbUrl, timestamp: new Date().toISOString() },
      rootKey: 'movies', processingStatus: 'completed',
    })
    .onConflictDoUpdate({
      target: videos.id,
      set: {
        filename: v.filename, displayName: v.displayName,
        path: v.dbPath, size: v.stat.size, lastModified: v.stat.mtime,
        metadata: v.metadata, categories: v.categories, customCategories: v.customCategories,
        thumbnail: { generated: true, dataUrl: v.thumbUrl, timestamp: new Date().toISOString() },
        processingStatus: 'completed',
      },
    });
}
