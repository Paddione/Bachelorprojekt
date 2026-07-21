import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { eq, like } from 'drizzle-orm';
import { videos } from '@shared/schema';
import {
  scanMoviesDirectory,
  generateMovieThumbnail,
  cleanupEmptyDirectories,
  MOVIE_EXTENSIONS,
} from '../handlers/movie-handler';
import { getMovieWatcherInstance } from '../lib/movie-watcher';
import { jobQueue } from '../lib/job-queue';
import { logger } from '../lib/logger';
import { readSidecar, writeSidecar } from '../lib/sidecar';
import { generateVideoIdSync } from '@shared/video-id';
import { db } from '../db';
import { MOVIES_DIR, sanitizeName, resolveAndValidateMovieDir } from './processing-helpers';

export async function handleMoviesScan(req: Request, res: Response) {
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
}

export async function handleMoviesProcess(req: Request, res: Response) {
  try {
    const { inputPath, autoOrganize = true, rootKey } = req.body;
    if (!inputPath) {
      return res.status(400).json({ error: 'inputPath is required' });
    }
    const job = jobQueue.add('process-movie', { inputPath, autoOrganize, rootKey });
    res.status(202).json({
      success: true,
      message: 'Movie processing queued',
      jobId: job.id,
    });
  } catch (error: any) {
    logger.error('[Processing] Movie process failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

export async function handleMoviesBatch(req: Request, res: Response) {
  try {
    const { directory, autoOrganize = true } = req.body;
    const movies = await scanMoviesDirectory(directory, true);
    if (movies.length === 0) {
      return res.json({ success: true, message: 'No movies found to process', count: 0 });
    }
    const jobs = movies.map((moviePath) =>
      jobQueue.add('process-movie', { inputPath: moviePath, autoOrganize }),
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
}

export async function handleMoviesRescan(req: Request, res: Response) {
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
}

export async function handleMoviesRename(req: Request, res: Response) {
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
    const dirStat = await fs.stat(resolvedDir);
    if (!dirStat.isDirectory()) {
      return res.status(400).json({ error: 'movieDir is not a directory' });
    }
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

    const thumbOld = path.join(thumbsDir, `${oldBaseName}_thumb.jpg`);
    const thumbNew = path.join(thumbsDir, `${sanitizedNewName}_thumb.jpg`);
    const spriteOld = path.join(thumbsDir, `${oldBaseName}_sprite.jpg`);
    const spriteNew = path.join(thumbsDir, `${sanitizedNewName}_sprite.jpg`);

    let thumbExists = false;
    let spriteExists = false;
    try { await fs.access(thumbOld); await fs.rename(thumbOld, thumbNew); thumbExists = true; } catch {}
    try { await fs.access(spriteOld); await fs.rename(spriteOld, spriteNew); spriteExists = true; } catch {}

    const videoOld = path.join(resolvedDir, videoFile.name);
    const videoNew = path.join(resolvedDir, `${sanitizedNewName}${ext}`);
    await fs.rename(videoOld, videoNew);

    const parentDir = path.dirname(resolvedDir);
    const newDirPath = path.join(parentDir, sanitizedNewName);
    await fs.rename(resolvedDir, newDirPath);

    if (!thumbExists || !spriteExists) {
      try {
        const newThumbsDir = path.join(newDirPath, 'Thumbnails');
        await fs.mkdir(newThumbsDir, { recursive: true });
        const newVideoPath = path.join(newDirPath, `${sanitizedNewName}${ext}`);
        await generateMovieThumbnail(newVideoPath, newThumbsDir);
        thumbnailsGenerated = true;
      } catch (thumbError: any) {
        logger.warn('[Processing] Thumbnail generation failed during rename', { error: thumbError.message });
      }
    }

    const oldSidecar = await readSidecar(newDirPath);
    const oldRelPath = path.relative(MOVIES_DIR, resolvedDir);
    const newRelPath = path.relative(MOVIES_DIR, newDirPath);
    const newRelVideoPath = path.join(newRelPath, `${sanitizedNewName}${ext}`);
    const newDbPath = `movies/${newRelVideoPath}`;
    const newId = generateVideoIdSync(crypto, 'movies', newRelVideoPath);

    try {
      if (db) {
        await db.delete(videos).where(like(videos.path, `movies/${oldRelPath}/%`));
        const newThumbsDir = path.join(newDirPath, 'Thumbnails');
        const thumbPath = path.join(newThumbsDir, `${sanitizedNewName}_thumb.jpg`);
        let thumbUrl: string | null = null;
        try {
          await fs.access(thumbPath);
          thumbUrl = `/media/movies/${newRelPath}/Thumbnails/${encodeURIComponent(sanitizedNewName)}_thumb.jpg`;
        } catch {}

        const newVideoPath = path.join(newDirPath, `${sanitizedNewName}${ext}`);
        const stat = await fs.stat(newVideoPath);
        const categories = (oldSidecar?.categories || { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] }) as any;
        const customCategories = (oldSidecar?.customCategories || {}) as any;
        const metadata = oldSidecar?.metadata || { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' };

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
      logger.warn('[Processing] DB update failed during rename (non-fatal)', { error: dbError.message });
    }

    logger.info(`[Processing] Movie renamed: ${oldRelPath} -> ${newRelPath}`);
    res.json({ success: true, oldPath: oldRelPath, newPath: newRelPath, thumbnailsGenerated });
  } catch (error: any) {
    logger.error('[Processing] Movie rename failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

export async function handleMoviesDelete(req: Request, res: Response) {
  try {
    const { movieDir } = req.body;
    if (!movieDir) {
      return res.status(400).json({ error: 'movieDir is required' });
    }
    const resolvedDir = resolveAndValidateMovieDir(movieDir);
    const dirStat = await fs.stat(resolvedDir);
    if (!dirStat.isDirectory()) {
      return res.status(400).json({ error: 'movieDir is not a directory' });
    }
    const relPath = path.relative(MOVIES_DIR, resolvedDir);
    await fs.rm(resolvedDir, { recursive: true, force: true });

    let dbDeleted = 0;
    try {
      if (db) {
        const result = await db.delete(videos).where(like(videos.path, `movies/${relPath}/%`));
        dbDeleted = result?.rowCount ?? 0;
      }
    } catch (dbError: any) {
      logger.warn('[Processing] DB delete failed during movie delete (non-fatal)', { error: dbError.message });
    }

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
    res.json({ success: true, deleted: relPath, dbRecordsRemoved: dbDeleted });
  } catch (error: any) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return res.status(404).json({ error: 'Directory not found' });
    }
    logger.error('[Processing] Movie delete failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

export async function handleMoviesOrganizeInbox(req: Request, res: Response) {
  try {
    const { source = '1_inbox', destination = '3_complete' } = req.body;
    const sourceDir = resolveAndValidateMovieDir(source);
    const destDir = resolveAndValidateMovieDir(destination);

    await fs.access(sourceDir);
    await fs.mkdir(destDir, { recursive: true });

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
      const organizedFilename = `${dirName}${ext}`;
      const tempDir = path.join(sourceDir, dirName);
      const thumbsDir = path.join(tempDir, 'Thumbnails');
      const finalDir = path.join(destDir, dirName);

      try {
        await fs.mkdir(thumbsDir, { recursive: true });
        const newVideoPath = path.join(tempDir, organizedFilename);
        await fs.rename(videoPath, newVideoPath);

        try {
          await generateMovieThumbnail(newVideoPath, thumbsDir);
        } catch (thumbError: any) {
          logger.error(`[Processing] Thumbnail generation failed for ${entry.name}, rolling back`, { error: thumbError.message });
          try {
            await fs.rename(newVideoPath, videoPath);
            await fs.rm(tempDir, { recursive: true, force: true });
          } catch (rollbackError: any) {
            logger.error(`[Processing] Rollback failed for ${entry.name}`, { error: rollbackError.message });
          }
          results.push({ file: entry.name, status: 'error', error: `Thumbnail generation failed: ${thumbError.message}` });
          failed++;
          continue;
        }

        try {
          await writeSidecar(tempDir, {
            version: 1,
            filename: organizedFilename,
            originalFilename: entry.name,
            displayName: dirName,
          });
        } catch {}

        await fs.rename(tempDir, finalDir);
        results.push({ file: entry.name, status: 'ok' });
        processed++;
      } catch (fileError: any) {
        results.push({ file: entry.name, status: 'error', error: fileError.message });
        failed++;
        logger.error(`[Processing] Failed to organize ${entry.name}`, { error: fileError.message });
      }
    }

    let cleaned = 0;
    try {
      cleaned = await cleanupEmptyDirectories(sourceDir);
    } catch (cleanError: any) {
      logger.warn('[Processing] Inbox cleanup failed (non-fatal)', { error: cleanError.message });
    }

    logger.info(`[Processing] Inbox organized: ${processed} processed, ${failed} failed, ${cleaned} empty dirs removed`);
    res.json({ success: true, processed, failed, cleaned, results });
  } catch (error: any) {
    logger.error('[Processing] Organize inbox failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

export async function handleMoviesIndex(req: Request, res: Response) {
  try {
    const { subdirectory, forceReindex = false } = req.body;
    const scanRoot = subdirectory ? resolveAndValidateMovieDir(subdirectory) : MOVIES_DIR;
    await fs.access(scanRoot);

    let indexed = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ path: string; error: string }> = [];

    async function scanDir(dir: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      const videoFile = entries.find(
        (e) => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()),
      );

      if (videoFile) {
        try {
          const videoPath = path.join(dir, videoFile.name);
          const relDir = path.relative(MOVIES_DIR, dir);
          const relVideoPath = path.join(relDir, videoFile.name);
          const baseName = path.basename(videoFile.name, path.extname(videoFile.name));

          const thumbPath = path.join(dir, 'Thumbnails', `${baseName}_thumb.jpg`);
          const spritePath = path.join(dir, 'Thumbnails', `${baseName}_sprite.jpg`);
          let thumbExists = false;
          let spriteExists = false;
          try { await fs.access(thumbPath); thumbExists = true; } catch {}
          try { await fs.access(spritePath); spriteExists = true; } catch {}

          if (!thumbExists || !spriteExists) {
            skipped++;
            return;
          }

          const id = generateVideoIdSync(crypto, 'movies', relVideoPath);
          if (!forceReindex && db) {
            const existing = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, id)).limit(1);
            if (existing.length > 0) {
              skipped++;
              return;
            }
          }

          const stat = await fs.stat(videoPath);
          const thumbUrl = `/media/movies/${relDir}/Thumbnails/${encodeURIComponent(baseName)}_thumb.jpg`;
          const sidecar = await readSidecar(dir);
          const displayName = sidecar?.displayName || baseName;
          const metadata = sidecar?.metadata || { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' };
          const categories = (sidecar?.categories || { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] }) as any;
          const customCategories = (sidecar?.customCategories || {}) as any;

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
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'Thumbnails' && entry.name !== '1_inbox') {
          await scanDir(path.join(dir, entry.name));
        }
      }
    }

    await scanDir(scanRoot);
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
}

export async function handleMoviesCleanup(req: Request, res: Response) {
  try {
    const { directory } = req.body;
    const targetDir = directory ? resolveAndValidateMovieDir(directory) : undefined;
    const removed = await cleanupEmptyDirectories(targetDir);
    logger.info(`[Processing] Cleanup complete: ${removed} empty directories removed`);
    res.json({ success: true, removed });
  } catch (error: any) {
    logger.error('[Processing] Cleanup failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}
