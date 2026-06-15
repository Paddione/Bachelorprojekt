import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { eq, like } from 'drizzle-orm';
import { videos } from '@shared/schema';
import { handleMovieProcessing, scanMoviesDirectory, batchProcessMovies, generateMovieThumbnail, cleanupEmptyDirectories, cleanupOrphanedThumbnails, extractMovieMetadata, detectQualityCategories, MOVIE_EXTENSIONS } from '../handlers/movie-handler';
import { getMovieWatcherInstance } from '../lib/movie-watcher';
import { handleAudiobookProcessing, scanAudiobooksDirectory } from '../handlers/audiobook-handler';
import { handleEbookProcessing, scanEbooksDirectory } from '../handlers/ebook-handler';
import { jobQueue } from '../lib/job-queue';
import { logger } from '../lib/logger';
import { readSidecar, writeSidecar } from '../lib/sidecar';
import { generateVideoIdSync } from '@shared/video-id';
import { db } from '../db';

const router = Router();

// ============================================================================
// Movie Processing Routes
// ============================================================================

/**
 * POST /api/processing/movies/scan
 * Scan movies directory and return list of movie files
 */
router.post('/movies/scan', async (req: Request, res: Response) => {
  try {
    const { directory, recursive = true } = req.body;
    const movies = await scanMoviesDirectory(directory, recursive);

    res.json({
      success: true,
      count: movies.length,
      movies: movies.map((p) => ({
        path: p,
        filename: p.split('/').pop(),
      })),
    });
  } catch (error: any) {
    logger.error('[Processing] Movie scan failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/movies/process
 * Process a single movie file
 */
router.post('/movies/process', async (req: Request, res: Response) => {
  try {
    const { inputPath, autoOrganize = true, rootKey } = req.body;

    if (!inputPath) {
      return res.status(400).json({ error: 'inputPath is required' });
    }

    // Queue the job
    const job = jobQueue.add('process-movie', {
      inputPath,
      autoOrganize,
      rootKey,
    });

    res.status(202).json({
      success: true,
      message: 'Movie processing queued',
      jobId: job.id,
    });
  } catch (error: any) {
    logger.error('[Processing] Movie process failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/movies/batch
 * Batch process all movies in a directory
 */
router.post('/movies/batch', async (req: Request, res: Response) => {
  try {
    const { directory, autoOrganize = true, concurrency = 2 } = req.body;

    // Scan for movies first
    const movies = await scanMoviesDirectory(directory, true);

    if (movies.length === 0) {
      return res.json({
        success: true,
        message: 'No movies found to process',
        count: 0,
      });
    }

    // Queue all jobs
    const jobs = movies.map((moviePath) =>
      jobQueue.add('process-movie', {
        inputPath: moviePath,
        autoOrganize,
      }),
    );

    res.status(202).json({
      success: true,
      message: `Queued ${jobs.length} movies for processing`,
      count: jobs.length,
      jobIds: jobs.map((j) => j.id),
    });
  } catch (error: any) {
    logger.error('[Processing] Movie batch failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/movies/rescan
 * Force a fresh scan of all movies, queuing any missing thumbnails for processing
 */
router.post('/movies/rescan', async (req: Request, res: Response) => {
  try {
    const watcher = getMovieWatcherInstance();
    if (!watcher) {
      return res.status(503).json({ error: 'Movie watcher is not running' });
    }

    const queued = await watcher.rescan();

    res.json({
      success: true,
      message: `Rescan complete — queued ${queued} movies for processing`,
      queued,
    });
  } catch (error: any) {
    logger.error('[Processing] Movie rescan failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Movie Management Routes (Rename, Delete, Organize)
// ============================================================================

const MOVIES_DIR = process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');

function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim();
}

function resolveAndValidateMovieDir(movieDir: string): string {
  const resolved = path.resolve(MOVIES_DIR, movieDir);
  if (!resolved.startsWith(path.resolve(MOVIES_DIR))) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

/**
 * POST /api/processing/movies/rename
 * Rename a movie directory, its video file, and thumbnails
 */
router.post('/movies/rename', async (req: Request, res: Response) => {
  try {
    const { movieDir, newName } = req.body;
    if (!movieDir || !newName) {
      return res.status(400).json({ error: 'movieDir and newName are required' });
    }

    const resolvedDir = resolveAndValidateMovieDir(movieDir);
    const sanitizedNewName = sanitizeName(newName);
    if (!sanitizedNewName) {
      return res.status(400).json({ error: 'newName is empty after sanitization' });
    }

    // Verify directory exists
    const dirStat = await fs.stat(resolvedDir);
    if (!dirStat.isDirectory()) {
      return res.status(400).json({ error: 'movieDir is not a directory' });
    }

    // Find the video file inside the directory
    const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
    const videoFile = entries.find(
      (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
    );
    if (!videoFile) {
      return res.status(400).json({ error: 'No video file found in directory' });
    }

    const oldBaseName = path.basename(videoFile.name, path.extname(videoFile.name));
    const ext = path.extname(videoFile.name);
    const thumbsDir = path.join(resolvedDir, 'Thumbnails');
    let thumbnailsGenerated = false;

    // 1. Rename thumbnails (if they exist)
    const thumbOld = path.join(thumbsDir, `${oldBaseName}_thumb.jpg`);
    const thumbNew = path.join(thumbsDir, `${sanitizedNewName}_thumb.jpg`);
    const spriteOld = path.join(thumbsDir, `${oldBaseName}_sprite.jpg`);
    const spriteNew = path.join(thumbsDir, `${sanitizedNewName}_sprite.jpg`);

    let thumbExists = false;
    let spriteExists = false;

    try {
      await fs.access(thumbOld);
      await fs.rename(thumbOld, thumbNew);
      thumbExists = true;
    } catch { }

    try {
      await fs.access(spriteOld);
      await fs.rename(spriteOld, spriteNew);
      spriteExists = true;
    } catch { }

    // 2. Rename the video file
    const videoOld = path.join(resolvedDir, videoFile.name);
    const videoNew = path.join(resolvedDir, `${sanitizedNewName}${ext}`);
    await fs.rename(videoOld, videoNew);

    // 3. Rename the directory itself
    const parentDir = path.dirname(resolvedDir);
    const newDirPath = path.join(parentDir, sanitizedNewName);
    await fs.rename(resolvedDir, newDirPath);

    // 4. Generate thumbnails if they didn't exist
    if (!thumbExists || !spriteExists) {
      try {
        const newThumbsDir = path.join(newDirPath, 'Thumbnails');
        await fs.mkdir(newThumbsDir, { recursive: true });
        const newVideoPath = path.join(newDirPath, `${sanitizedNewName}${ext}`);
        await generateMovieThumbnail(newVideoPath, newThumbsDir);
        thumbnailsGenerated = true;
      } catch (thumbError: any) {
        logger.warn('[Processing] Thumbnail generation failed during rename', {
          error: thumbError.message,
        });
      }
    }

    // 5. Read existing sidecar to preserve categories across rename
    const oldSidecar = await readSidecar(newDirPath); // dir already renamed

    // 6. Update database: delete old records, upsert with deterministic ID
    const oldRelPath = path.relative(MOVIES_DIR, resolvedDir);
    const newRelPath = path.relative(MOVIES_DIR, newDirPath);
    const newRelVideoPath = path.join(newRelPath, `${sanitizedNewName}${ext}`);
    const newDbPath = `movies/${newRelVideoPath}`;
    const newId = generateVideoIdSync(crypto, 'movies', newRelVideoPath);

    try {
      if (db) {
        // Delete old records that match the old path
        await db.delete(videos).where(like(videos.path, `movies/${oldRelPath}/%`));

        // Check for thumbnail to build thumbnail URL
        const newThumbsDir = path.join(newDirPath, 'Thumbnails');
        const thumbPath = path.join(newThumbsDir, `${sanitizedNewName}_thumb.jpg`);
        let thumbUrl: string | null = null;
        try {
          await fs.access(thumbPath);
          thumbUrl = `/media/movies/${newRelPath}/Thumbnails/${encodeURIComponent(sanitizedNewName)}_thumb.jpg`;
        } catch { }

        // Stat the new video file
        const newVideoPath = path.join(newDirPath, `${sanitizedNewName}${ext}`);
        const stat = await fs.stat(newVideoPath);

        // Preserve categories from old sidecar
        const categories = (oldSidecar?.categories || { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] }) as any;
        const customCategories = (oldSidecar?.customCategories || {}) as any;
        const metadata = oldSidecar?.metadata || { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' };

        // Upsert with the deterministic ID that /movies/index would generate
        await db
          .insert(videos)
          .values({
            id: newId,
            filename: `${sanitizedNewName}${ext}`,
            displayName: sanitizedNewName,
            path: newDbPath,
            size: stat.size,
            lastModified: stat.mtime,
            metadata,
            categories,
            customCategories,
            thumbnail: thumbUrl ? { generated: true, dataUrl: thumbUrl, timestamp: new Date().toISOString() } : null,
            rootKey: 'movies',
            processingStatus: thumbUrl ? 'completed' : 'pending',
          })
          .onConflictDoUpdate({
            target: videos.id,
            set: {
              filename: `${sanitizedNewName}${ext}`,
              displayName: sanitizedNewName,
              path: newDbPath,
              size: stat.size,
              lastModified: stat.mtime,
              metadata,
              categories,
              customCategories,
              thumbnail: thumbUrl ? { generated: true, dataUrl: thumbUrl, timestamp: new Date().toISOString() } : null,
              processingStatus: thumbUrl ? 'completed' : 'pending',
            },
          });

        // Write updated sidecar with new name and ID
        await writeSidecar(newDirPath, {
          version: 1,
          id: newId,
          filename: `${sanitizedNewName}${ext}`,
          displayName: sanitizedNewName,
          size: stat.size,
          lastModified: stat.mtime.toISOString(),
          metadata,
          categories,
          customCategories,
        });
      }
    } catch (dbError: any) {
      logger.warn('[Processing] DB update failed during rename (non-fatal)', {
        error: dbError.message,
      });
    }

    logger.info(`[Processing] Movie renamed: ${oldRelPath} -> ${newRelPath}`);

    res.json({
      success: true,
      oldPath: oldRelPath,
      newPath: newRelPath,
      thumbnailsGenerated,
    });
  } catch (error: any) {
    logger.error('[Processing] Movie rename failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/movies/delete
 * Delete a movie directory and all its contents
 */
router.post('/movies/delete', async (req: Request, res: Response) => {
  try {
    const { movieDir } = req.body;
    if (!movieDir) {
      return res.status(400).json({ error: 'movieDir is required' });
    }

    const resolvedDir = resolveAndValidateMovieDir(movieDir);

    // Verify it exists and is a directory
    const dirStat = await fs.stat(resolvedDir);
    if (!dirStat.isDirectory()) {
      return res.status(400).json({ error: 'movieDir is not a directory' });
    }

    const relPath = path.relative(MOVIES_DIR, resolvedDir);

    // Remove the entire directory
    await fs.rm(resolvedDir, { recursive: true, force: true });

    // Delete matching database records (paths stored as "movies/<relPath>/...")
    let dbDeleted = 0;
    try {
      if (db) {
        const result = await db
          .delete(videos)
          .where(like(videos.path, `movies/${relPath}/%`));
        dbDeleted = result?.rowCount ?? 0;
      }
    } catch (dbError: any) {
      logger.warn('[Processing] DB delete failed during movie delete (non-fatal)', {
        error: dbError.message,
      });
    }

    // Clean up empty parent directories
    let parentDir = path.dirname(resolvedDir);
    const resolvedMoviesDir = path.resolve(MOVIES_DIR);
    while (parentDir !== resolvedMoviesDir && parentDir.startsWith(resolvedMoviesDir)) {
      try {
        const entries = await fs.readdir(parentDir);
        if (entries.length === 0) {
          await fs.rmdir(parentDir);
          logger.info(`[Processing] Removed empty parent directory: ${path.relative(MOVIES_DIR, parentDir)}`);
          parentDir = path.dirname(parentDir);
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    logger.info(`[Processing] Movie deleted: ${relPath}`, { dbDeleted });

    res.json({
      success: true,
      deleted: relPath,
      dbRecordsRemoved: dbDeleted,
    });
  } catch (error: any) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return res.status(404).json({ error: 'Directory not found' });
    }
    logger.error('[Processing] Movie delete failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/movies/organize-inbox
 * Organize loose video files into directories with thumbnails
 */
router.post('/movies/organize-inbox', async (req: Request, res: Response) => {
  try {
    const { source = '1_inbox', destination = '3_complete' } = req.body;

    const sourceDir = resolveAndValidateMovieDir(source);
    const destDir = resolveAndValidateMovieDir(destination);

    // Verify source exists
    await fs.access(sourceDir);
    await fs.mkdir(destDir, { recursive: true });

    // Scan for video files (top-level only)
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    const videoFiles = entries.filter(
      (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
    );

    if (videoFiles.length === 0) {
      return res.json({
        success: true,
        message: 'No video files found in source directory',
        processed: 0,
        failed: 0,
        results: [],
      });
    }

    const results: Array<{ file: string; status: string; error?: string }> = [];
    let processed = 0;
    let failed = 0;

    for (const entry of videoFiles) {
      const videoPath = path.join(sourceDir, entry.name);
      const baseName = path.basename(entry.name, path.extname(entry.name));
      const ext = path.extname(entry.name);
      const dirName = sanitizeName(baseName);
      // Rename the file to match the directory name
      const organizedFilename = `${dirName}${ext}`;
      const tempDir = path.join(sourceDir, dirName);
      const thumbsDir = path.join(tempDir, 'Thumbnails');
      const finalDir = path.join(destDir, dirName);

      try {
        // Create directory structure in source
        await fs.mkdir(thumbsDir, { recursive: true });

        // Move and rename video into the new directory
        const newVideoPath = path.join(tempDir, organizedFilename);
        await fs.rename(videoPath, newVideoPath);

        // Generate thumbnails — rollback if this fails
        try {
          await generateMovieThumbnail(newVideoPath, thumbsDir);
        } catch (thumbError: any) {
          logger.error(`[Processing] Thumbnail generation failed for ${entry.name}, rolling back`, {
            error: thumbError.message,
          });
          // Rollback: move video back to inbox and remove temp directory
          try {
            await fs.rename(newVideoPath, videoPath);
            await fs.rm(tempDir, { recursive: true, force: true });
          } catch (rollbackError: any) {
            logger.error(`[Processing] Rollback failed for ${entry.name}`, {
              error: rollbackError.message,
            });
          }
          results.push({ file: entry.name, status: 'error', error: `Thumbnail generation failed: ${thumbError.message}` });
          failed++;
          continue;
        }

        // Write metadata.json sidecar preserving original filename
        try {
          await writeSidecar(tempDir, {
            version: 1,
            filename: organizedFilename,
            originalFilename: entry.name,
            displayName: dirName,
          });
        } catch { /* non-fatal */ }

        // Move organized directory to destination
        await fs.rename(tempDir, finalDir);

        results.push({ file: entry.name, status: 'ok' });
        processed++;
      } catch (fileError: any) {
        results.push({ file: entry.name, status: 'error', error: fileError.message });
        failed++;
        logger.error(`[Processing] Failed to organize ${entry.name}`, {
          error: fileError.message,
        });
      }
    }

    // Clean up empty directories left behind in inbox
    let cleaned = 0;
    try {
      cleaned = await cleanupEmptyDirectories(sourceDir);
    } catch (cleanError: any) {
      logger.warn('[Processing] Inbox cleanup failed (non-fatal)', { error: cleanError.message });
    }

    logger.info(`[Processing] Inbox organized: ${processed} processed, ${failed} failed, ${cleaned} empty dirs removed`);

    res.json({
      success: true,
      processed,
      failed,
      cleaned,
      results,
    });
  } catch (error: any) {
    logger.error('[Processing] Organize inbox failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/movies/index
 * Index existing movie directories into the videos DB table (no ffmpeg, just readdir + stat + upsert)
 */
router.post('/movies/index', async (req: Request, res: Response) => {
  try {
    const { subdirectory, forceReindex = false } = req.body;
    const scanRoot = subdirectory
      ? resolveAndValidateMovieDir(subdirectory)
      : MOVIES_DIR;

    // Verify directory exists
    await fs.access(scanRoot);

    let indexed = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ path: string; error: string }> = [];

    // Recursively find movie directories (directories containing a video file)
    async function scanDir(dir: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      // Check if this directory contains a video file
      const videoFile = entries.find(
        (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
      );

      if (videoFile) {
        // This is a movie directory — index it
        try {
          const videoPath = path.join(dir, videoFile.name);
          const relDir = path.relative(MOVIES_DIR, dir);
          const relVideoPath = path.join(relDir, videoFile.name);
          const baseName = path.basename(videoFile.name, path.extname(videoFile.name));

          // Require both thumbnail and sprite to exist — skip incomplete entries
          const thumbPath = path.join(dir, 'Thumbnails', `${baseName}_thumb.jpg`);
          const spritePath = path.join(dir, 'Thumbnails', `${baseName}_sprite.jpg`);
          let thumbExists = false;
          let spriteExists = false;
          try { await fs.access(thumbPath); thumbExists = true; } catch { }
          try { await fs.access(spritePath); spriteExists = true; } catch { }

          if (!thumbExists || !spriteExists) {
            skipped++;
            return;
          }

          // Deterministic ID from relative path
          const id = generateVideoIdSync(crypto, 'movies', relVideoPath);

          // Check if already indexed
          if (!forceReindex && db) {
            const existing = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, id)).limit(1);
            if (existing.length > 0) {
              skipped++;
              return;
            }
          }

          // Stat the video file
          const stat = await fs.stat(videoPath);

          const thumbUrl = `/media/movies/${relDir}/Thumbnails/${encodeURIComponent(baseName)}_thumb.jpg`;

          // Read existing sidecar for categories and metadata
          const sidecar = await readSidecar(dir);
          const displayName = sidecar?.displayName || baseName;
          const metadata = sidecar?.metadata || { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' };
          const categories = (sidecar?.categories || { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] }) as any;
          const customCategories = (sidecar?.customCategories || {}) as any;

          // Upsert into videos table
          if (db) {
            const dbPath = `movies/${relVideoPath}`;
            await db
              .insert(videos)
              .values({
                id,
                filename: videoFile.name,
                displayName,
                path: dbPath,
                size: stat.size,
                lastModified: stat.mtime,
                metadata,
                categories,
                customCategories,
                thumbnail: { generated: true, dataUrl: thumbUrl, timestamp: new Date().toISOString() },
                rootKey: 'movies',
                processingStatus: 'completed',
              })
              .onConflictDoUpdate({
                target: videos.id,
                set: {
                  filename: videoFile.name,
                  displayName,
                  path: dbPath,
                  size: stat.size,
                  lastModified: stat.mtime,
                  metadata,
                  categories,
                  customCategories,
                  thumbnail: { generated: true, dataUrl: thumbUrl, timestamp: new Date().toISOString() },
                  processingStatus: 'completed',
                },
              });

            indexed++;
          }
        } catch (err: any) {
          errors++;
          errorDetails.push({ path: path.relative(MOVIES_DIR, dir), error: err.message });
        }
        return; // Don't recurse into subdirectories of a movie directory
      }

      // Recurse into subdirectories (skip Thumbnails and 1_inbox)
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'Thumbnails' && entry.name !== '1_inbox') {
          await scanDir(path.join(dir, entry.name));
        }
      }
    }

    await scanDir(scanRoot);

    // Clean up empty directories left behind by moves/deletes
    let cleaned = 0;
    try {
      cleaned = await cleanupEmptyDirectories();
    } catch (cleanError: any) {
      logger.warn('[Processing] Empty directory cleanup failed (non-fatal)', { error: cleanError.message });
    }

    logger.info(`[Processing] Movie index complete: ${indexed} indexed, ${skipped} skipped, ${errors} errors, ${cleaned} empty dirs removed`);

    res.json({
      success: true,
      indexed,
      skipped,
      errors,
      cleaned,
      total: indexed + skipped + errors,
      ...(errorDetails.length > 0 && { errorDetails: errorDetails.slice(0, 20) }),
    });
  } catch (error: any) {
    logger.error('[Processing] Movie index failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/movies/cleanup
 * Remove empty directories from the movies directory tree
 */
router.post('/movies/cleanup', async (req: Request, res: Response) => {
  try {
    const { directory } = req.body;
    const targetDir = directory ? resolveAndValidateMovieDir(directory) : undefined;
    const removed = await cleanupEmptyDirectories(targetDir);

    logger.info(`[Processing] Cleanup complete: ${removed} empty directories removed`);

    res.json({
      success: true,
      removed,
    });
  } catch (error: any) {
    logger.error('[Processing] Cleanup failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Audiobook Processing Routes
// ============================================================================

/**
 * POST /api/processing/audiobooks/scan
 * Scan audiobooks directory and return list of audiobook folders
 */
router.post('/audiobooks/scan', async (req: Request, res: Response) => {
  try {
    const { directory } = req.body;
    const audiobooks = await scanAudiobooksDirectory(directory);

    res.json({
      success: true,
      count: audiobooks.length,
      audiobooks,
    });
  } catch (error: any) {
    logger.error('[Processing] Audiobook scan failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/audiobooks/process
 * Process a single audiobook folder
 */
router.post('/audiobooks/process', async (req: Request, res: Response) => {
  try {
    const { inputPath, autoOrganize = true, rootKey } = req.body;

    if (!inputPath) {
      return res.status(400).json({ error: 'inputPath is required' });
    }

    // Queue the job
    const job = jobQueue.add('process-audiobook', {
      inputPath,
      autoOrganize,
      rootKey,
    });

    res.status(202).json({
      success: true,
      message: 'Audiobook processing queued',
      jobId: job.id,
    });
  } catch (error: any) {
    logger.error('[Processing] Audiobook process failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/audiobooks/batch
 * Batch process all audiobooks in a directory
 */
router.post('/audiobooks/batch', async (req: Request, res: Response) => {
  try {
    const { directory, autoOrganize = true } = req.body;

    // Scan for audiobooks first
    const audiobooks = await scanAudiobooksDirectory(directory);

    if (audiobooks.length === 0) {
      return res.json({
        success: true,
        message: 'No audiobooks found to process',
        count: 0,
      });
    }

    // Queue all jobs
    const jobs = audiobooks.map((ab) =>
      jobQueue.add('process-audiobook', {
        inputPath: ab.path,
        autoOrganize,
      }),
    );

    res.status(202).json({
      success: true,
      message: `Queued ${jobs.length} audiobooks for processing`,
      count: jobs.length,
      jobIds: jobs.map((j) => j.id),
    });
  } catch (error: any) {
    logger.error('[Processing] Audiobook batch failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Ebook Processing Routes
// ============================================================================

/**
 * POST /api/processing/ebooks/scan
 * Scan ebooks directory and return list of ebook folders
 */
router.post('/ebooks/scan', async (req: Request, res: Response) => {
  try {
    const { directory } = req.body;
    const ebooks = await scanEbooksDirectory(directory);

    res.json({
      success: true,
      count: ebooks.length,
      ebooks,
    });
  } catch (error: any) {
    logger.error('[Processing] Ebook scan failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/ebooks/process
 * Process a single ebook folder
 */
router.post('/ebooks/process', async (req: Request, res: Response) => {
  try {
    const { inputPath, autoOrganize = true, rootKey } = req.body;

    if (!inputPath) {
      return res.status(400).json({ error: 'inputPath is required' });
    }

    // Queue the job
    const job = jobQueue.add('process-ebook', {
      inputPath,
      autoOrganize,
      rootKey,
    });

    res.status(202).json({
      success: true,
      message: 'Ebook processing queued',
      jobId: job.id,
    });
  } catch (error: any) {
    logger.error('[Processing] Ebook process failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/ebooks/batch
 * Batch process all ebooks in a directory
 */
router.post('/ebooks/batch', async (req: Request, res: Response) => {
  try {
    const { directory, autoOrganize = true } = req.body;

    // Scan for ebooks first
    const ebooks = await scanEbooksDirectory(directory);

    if (ebooks.length === 0) {
      return res.json({
        success: true,
        message: 'No ebooks found to process',
        count: 0,
      });
    }

    // Queue all jobs
    const jobs = ebooks.map((eb) =>
      jobQueue.add('process-ebook', {
        inputPath: eb.path,
        autoOrganize,
      }),
    );

    res.status(202).json({
      success: true,
      message: `Queued ${jobs.length} ebooks for processing`,
      count: jobs.length,
      jobIds: jobs.map((j) => j.id),
    });
  } catch (error: any) {
    logger.error('[Processing] Ebook batch failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// HDD-ext Processing Routes
// ============================================================================

const HDD_EXT_DIR = process.env.HDD_EXT_DIR || path.join(process.cwd(), 'media', 'hdd-ext');
const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');

/**
 * POST /api/processing/hdd-ext/process
 * Process HDD-ext videos: either a single file (via filePath) or batch all.
 * - filePath: relative path within HDD_EXT_DIR for single-file processing
 * - Without filePath: batch process all videos found in HDD_EXT_DIR
 */
router.post('/hdd-ext/process', async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;

    if (filePath) {
      // Single file processing
      const resolved = path.resolve(HDD_EXT_DIR, filePath);
      if (!resolved.startsWith(path.resolve(HDD_EXT_DIR))) {
        return res.status(403).json({ error: 'Path traversal not allowed' });
      }

      const job = jobQueue.add('process-movie', {
        inputPath: resolved,
        autoOrganize: false,
        rootKey: 'hdd-ext',
        baseDir: MEDIA_ROOT,
      });

      return res.status(202).json({
        success: true,
        message: 'HDD-ext file queued for processing',
        jobId: job.id,
      });
    }

    // Batch processing — scan and queue all
    const files = await scanMoviesDirectory(HDD_EXT_DIR, true, ['Thumbnails']);

    if (files.length === 0) {
      return res.json({
        success: true,
        message: 'No video files found in HDD-ext',
        count: 0,
      });
    }

    const jobs = files.map((filePath) =>
      jobQueue.add('process-movie', {
        inputPath: filePath,
        autoOrganize: false,
        rootKey: 'hdd-ext',
        baseDir: MEDIA_ROOT,
      }),
    );

    res.status(202).json({
      success: true,
      message: `Queued ${jobs.length} HDD-ext videos for processing`,
      count: jobs.length,
      jobIds: jobs.map((j) => j.id),
    });
  } catch (error: any) {
    logger.error('[Processing] HDD-ext process failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/hdd-ext/rescan
 * Rescan HDD-ext and queue videos missing thumbnails for processing
 */
router.post('/hdd-ext/rescan', async (req: Request, res: Response) => {
  try {
    const files = await scanMoviesDirectory(HDD_EXT_DIR, true, ['Thumbnails']);
    let queued = 0;

    for (const filePath of files) {
      const baseName = path.basename(filePath, path.extname(filePath));
      const dir = path.dirname(filePath);
      const thumbPath = path.join(dir, 'Thumbnails', `${baseName}_thumb.jpg`);

      let hasThumb = false;
      try {
        await fs.access(thumbPath);
        hasThumb = true;
      } catch { /* no thumbnail */ }

      if (!hasThumb) {
        jobQueue.add('process-movie', {
          inputPath: filePath,
          autoOrganize: false,
          rootKey: 'hdd-ext',
          baseDir: MEDIA_ROOT,
        });
        queued++;
      }
    }

    res.json({
      success: true,
      message: `Rescan complete — found ${files.length} files, queued ${queued} for processing`,
      total: files.length,
      queued,
    });
  } catch (error: any) {
    logger.error('[Processing] HDD-ext rescan failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/processing/hdd-ext/index
 * Index HDD-ext directories into the videos DB table.
 * Uses ffprobe to extract metadata (duration, resolution, codec).
 * Requires existing thumbnails.
 */
router.post('/hdd-ext/index', async (req: Request, res: Response) => {
  try {
    const { forceReindex = false } = req.body;

    await fs.access(HDD_EXT_DIR);

    let indexed = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ path: string; error: string }> = [];

    // Collect all video entries first, then process with concurrency
    const pendingEntries: Array<{ videoPath: string; dir: string; videoFileName: string }> = [];

    async function scanDir(dir: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      // Check if this directory contains a video file
      const videoFile = entries.find(
        (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
      );

      if (videoFile) {
        pendingEntries.push({
          videoPath: path.join(dir, videoFile.name),
          dir,
          videoFileName: videoFile.name,
        });
        return;
      }

      // Recurse into subdirectories (skip Thumbnails)
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'Thumbnails') {
          await scanDir(path.join(dir, entry.name));
        }
      }
    }

    await scanDir(HDD_EXT_DIR);

    // Process entries with concurrency limit for ffprobe
    const CONCURRENCY = 4;
    for (let i = 0; i < pendingEntries.length; i += CONCURRENCY) {
      const batch = pendingEntries.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async ({ videoPath, dir, videoFileName }) => {
        try {
          const relDir = path.relative(MEDIA_ROOT, dir);
          const relVideoPath = path.join(relDir, videoFileName);
          const baseName = path.basename(videoFileName, path.extname(videoFileName));

          // Check for thumbnail (sprite optional for hdd-ext)
          const thumbPath = path.join(dir, 'Thumbnails', `${baseName}_thumb.jpg`);
          let thumbExists = false;
          try { await fs.access(thumbPath); thumbExists = true; } catch { }

          if (!thumbExists) {
            skipped++;
            return;
          }

          // Deterministic ID
          const id = generateVideoIdSync(crypto, 'hdd-ext', relVideoPath);

          // Check if already indexed
          if (!forceReindex && db) {
            const existing = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, id)).limit(1);
            if (existing.length > 0) {
              skipped++;
              return;
            }
          }

          const stat = await fs.stat(videoPath);
          const thumbUrl = `/media/${relDir}/Thumbnails/${encodeURIComponent(baseName)}_thumb.jpg`;

          // Extract metadata via ffprobe (duration, resolution, codec, etc.)
          let metadata = { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' };
          try {
            const probed = await extractMovieMetadata(videoPath);
            metadata = {
              duration: probed.duration || 0,
              width: probed.width || 0,
              height: probed.height || 0,
              bitrate: probed.bitrate || 0,
              codec: probed.codec || '',
              fps: probed.fps || 0,
              aspectRatio: probed.aspectRatio || '',
            };
          } catch (probeErr: any) {
            // Non-fatal: index without metadata if ffprobe fails
            logger.warn(`[Processing] ffprobe failed for ${relVideoPath}`, { error: probeErr.message });
          }

          // Read sidecar (disk is source of truth for categories)
          const sidecar = await readSidecar(dir);
          const defaultCategories = { age: [] as string[], physical: [] as string[], ethnicity: [] as string[], relationship: [] as string[], acts: [] as string[], setting: [] as string[], quality: [] as string[], performer: [] as string[] };
          const categories = (sidecar?.categories || defaultCategories) as typeof defaultCategories;
          const customCategories = sidecar?.customCategories || {};

          // Auto-detect quality from ffprobe metadata and merge with existing
          const autoQualities = detectQualityCategories(metadata);
          if (autoQualities.length > 0) {
            categories.quality = [...new Set([...categories.quality, ...autoQualities])];
          }

          if (db) {
            await db
              .insert(videos)
              .values({
                id,
                filename: videoFileName,
                displayName: baseName,
                path: relVideoPath,
                size: stat.size,
                lastModified: stat.mtime,
                metadata,
                categories,
                customCategories,
                thumbnail: { generated: true, dataUrl: thumbUrl, timestamp: new Date().toISOString() },
                rootKey: 'hdd-ext',
                processingStatus: 'completed',
              })
              .onConflictDoUpdate({
                target: videos.id,
                set: {
                  filename: videoFileName,
                  displayName: baseName,
                  path: relVideoPath,
                  size: stat.size,
                  lastModified: stat.mtime,
                  metadata,
                  categories,
                  customCategories,
                  thumbnail: { generated: true, dataUrl: thumbUrl, timestamp: new Date().toISOString() },
                  processingStatus: 'completed',
                },
              });

            // Write merged metadata back to sidecar
            await writeSidecar(dir, {
              version: 1,
              id,
              filename: videoFileName,
              displayName: baseName,
              size: stat.size,
              lastModified: stat.mtime.toISOString(),
              metadata,
              categories,
              customCategories,
            });

            indexed++;
          }
        } catch (err: any) {
          errors++;
          errorDetails.push({ path: path.relative(HDD_EXT_DIR, dir), error: err.message });
        }
      }));
    }

    logger.info(`[Processing] HDD-ext index complete: ${indexed} indexed, ${skipped} skipped, ${errors} errors`);

    res.json({
      success: true,
      indexed,
      skipped,
      errors,
      total: indexed + skipped + errors,
      ...(errorDetails.length > 0 && { errorDetails: errorDetails.slice(0, 20) }),
    });
  } catch (error: any) {
    logger.error('[Processing] HDD-ext index failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Combined Processing Routes
// ============================================================================

/**
 * POST /api/processing/scan-all
 * Scan all media directories and return counts
 */
router.post('/scan-all', async (req: Request, res: Response) => {
  try {
    const [movies, audiobooks, ebooks] = await Promise.all([
      scanMoviesDirectory().catch(() => []),
      scanAudiobooksDirectory().catch(() => []),
      scanEbooksDirectory().catch(() => []),
    ]);

    res.json({
      success: true,
      counts: {
        movies: movies.length,
        audiobooks: audiobooks.length,
        ebooks: ebooks.length,
        total: movies.length + audiobooks.length + ebooks.length,
      },
    });
  } catch (error: any) {
    logger.error('[Processing] Scan all failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/processing/stats
 * Get processing statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = jobQueue.getStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    logger.error('[Processing] Stats failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Register Job Handlers
// ============================================================================

// Register movie processing handler — regenerate index after each successful process
jobQueue.registerHandler('process-movie', async (data) => {
  const result = await handleMovieProcessing(data, {} as any, db);
  // Rebuild movies_index.json so new movies appear for all users
  try {
    const { generateMoviesIndex } = await import('../lib/startup-tasks');
    await generateMoviesIndex(db);
  } catch { /* non-fatal */ }
  return result;
});

// Register audiobook processing handler (will be implemented)
jobQueue.registerHandler('process-audiobook', async (data) => {
  return await handleAudiobookProcessing(data, {} as any, db);
});

// Register ebook processing handler (will be implemented)
jobQueue.registerHandler('process-ebook', async (data) => {
  return await handleEbookProcessing(data, {} as any, db);
});

export default router;
