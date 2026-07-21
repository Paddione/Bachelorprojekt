import path from 'path';
import fs from 'fs/promises';
import { videos, scanState } from '@shared/schema';
import { logger } from '../lib/logger';
import { readSidecar, writeSidecar } from '../lib/sidecar';
import { extractCategoriesFromPath, mergeCategories } from '@shared/category-extractor';
import type { JobContext } from '../lib/enhanced-job-queue';
import crypto from 'crypto';
import { generateVideoIdSync } from '@shared/video-id';

import type { MovieJobPayload, MovieMetadata } from './movie-types';
import {
  MOVIE_EXTENSIONS,
  parseMovieFilename,
  generateOrganizedPath,
  extractMovieMetadata,
  detectQualityCategories,
  calculateFileHash,
  generateMovieThumbnail,
} from './movie-helpers';

export {
  MOVIE_EXTENSIONS,
  parseMovieFilename,
  generateOrganizedPath,
  extractMovieMetadata,
  detectQualityCategories,
  generateMovieThumbnail,
};
export type { MovieJobPayload, MovieMetadata };

export async function handleMovieProcessing(
  data: MovieJobPayload,
  _context: JobContext,
  db: any,
) {
  const { inputPath, movieId, rootKey, autoOrganize = true, baseDir } = data;
  const MOVIES_DIR = process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');
  const PATH_BASE = baseDir || MOVIES_DIR;

  logger.info(`[MovieHandler] Processing movie: ${inputPath}`, { movieId, rootKey });

  try {
    await fs.access(inputPath);
    const stats = await fs.stat(inputPath);

    const { title, year } = parseMovieFilename(inputPath);
    logger.info(`[MovieHandler] Parsed: ${title} (${year || 'no year'})`, { inputPath });

    const metadata = await extractMovieMetadata(inputPath);
    logger.info(`[MovieHandler] Metadata extracted: ${metadata.duration}s, ${metadata.width}x${metadata.height}`, { inputPath });

    const fileHash = await calculateFileHash(inputPath);

    let finalPath = inputPath;
    let relativePath = path.relative(PATH_BASE, inputPath);
    const originalFilename = path.basename(inputPath);

    if (autoOrganize) {
      const ext = path.extname(inputPath);
      const organizedFolder = generateOrganizedPath(title, year);
      const targetDir = path.join(MOVIES_DIR, organizedFolder);
      const organizedFilename = `${organizedFolder}${ext}`;
      const targetPath = path.join(targetDir, organizedFilename);

      if (path.dirname(inputPath) !== targetDir || path.basename(inputPath) !== organizedFilename) {
        await fs.mkdir(targetDir, { recursive: true });

        try {
          await fs.rename(inputPath, targetPath);
          finalPath = targetPath;
          relativePath = path.relative(PATH_BASE, targetPath);
          logger.info(`[MovieHandler] Organized: ${inputPath} -> ${targetPath}`);
        } catch (moveError: any) {
          if (moveError.code === 'EXDEV') {
            await fs.copyFile(inputPath, targetPath);
            await fs.unlink(inputPath);
            finalPath = targetPath;
            relativePath = path.relative(PATH_BASE, targetPath);
            logger.info(`[MovieHandler] Organized (copy): ${inputPath} -> ${targetPath}`);
          } else {
            throw moveError;
          }
        }
      }
    }

    const movieDir = path.dirname(finalPath);
    const thumbsDir = path.join(movieDir, 'Thumbnails');
    await fs.mkdir(thumbsDir, { recursive: true });

    const thumbnails = await generateMovieThumbnail(finalPath, thumbsDir);
    logger.info(`[MovieHandler] Thumbnails generated: ${thumbnails.thumb}, ${thumbnails.sprite}`);

    const effectiveRootKey = rootKey || 'movies';
    const id = movieId || generateVideoIdSync(crypto, effectiveRootKey, relativePath);
    const isHddExt = rootKey === 'hdd-ext';

    let customCategories: any = {};
    const emptyCategories = { age: [] as string[], physical: [] as string[], ethnicity: [] as string[], relationship: [] as string[], acts: [] as string[], setting: [] as string[], quality: [] as string[], performer: [] as string[] };
    const qualityFromMeta = detectQualityCategories(metadata);

    let categories: any;
    if (isHddExt) {
      const sidecar = await readSidecar(movieDir);
      categories = sidecar?.categories || emptyCategories;
      customCategories = sidecar?.customCategories || {};
    } else {
      const dirName = path.basename(path.dirname(finalPath));
      const extracted = extractCategoriesFromPath(path.basename(finalPath), dirName);
      categories = mergeCategories(emptyCategories, extracted);
      categories.quality = [...new Set([...categories.quality, ...qualityFromMeta])];
    }

    if (db) {
      const baseName = path.basename(finalPath);
      const metadataObj = {
        title,
        year,
        ...metadata,
        thumbnailPath: path.relative(PATH_BASE, thumbnails.thumb),
        spritePath: path.relative(PATH_BASE, thumbnails.sprite),
      };

      await db
        .insert(videos)
        .values({
          id,
          filename: baseName,
          displayName: title + (year ? ` (${year})` : ''),
          path: relativePath,
          size: stats.size,
          lastModified: stats.mtime,
          fileHash,
          bitrate: metadata.bitrate,
          codec: metadata.codec,
          fps: metadata.fps,
          aspectRatio: metadata.aspectRatio,
          categories,
          customCategories,
          rootKey: rootKey || 'movies',
          metadata: metadataObj,
          processingStatus: 'completed',
          metadataExtractedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: videos.fileHash,
          set: {
            filename: baseName,
            displayName: title + (year ? ` (${year})` : ''),
            path: relativePath,
            categories,
            customCategories,
            processingStatus: 'completed',
          },
        });

      await writeSidecar(movieDir, {
        version: 1,
        id,
        filename: path.basename(finalPath),
        originalFilename,
        displayName: title + (year ? ` (${year})` : ''),
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        metadata: {
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          bitrate: metadata.bitrate,
          codec: metadata.codec,
          fps: metadata.fps,
          aspectRatio: metadata.aspectRatio,
        },
        categories,
        customCategories,
      });

      if (rootKey) {
        await db
          .insert(scanState)
          .values({
            rootKey,
            relativePath,
            fileHash,
            metadataExtracted: 'true',
            thumbnailGenerated: 'true',
            spriteGenerated: 'true',
            lastProcessedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [scanState.rootKey, scanState.relativePath],
            set: {
              fileHash,
              metadataExtracted: 'true',
              thumbnailGenerated: 'true',
              spriteGenerated: 'true',
              lastProcessedAt: new Date(),
            },
          });
      }
    }

    logger.info(`[MovieHandler] Successfully processed movie: ${title}`, {
      id,
      path: finalPath,
      duration: metadata.duration,
    });

    return {
      status: 'completed',
      movieId: id,
      title,
      year,
      path: finalPath,
      thumbnails,
      metadata,
    };
  } catch (error: any) {
    logger.error(`[MovieHandler] Failed to process movie: ${inputPath}`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

export async function scanMoviesDirectory(
  directory?: string,
  recursive = true,
  skipDirs: string[] = ['Thumbnails'],
): Promise<string[]> {
  const MOVIES_DIR = directory || process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');
  const movies: string[] = [];
  const skipSet = new Set(skipDirs);

  async function scanDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (skipSet.has(entry.name)) continue;
          if (recursive) {
            await scanDir(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (MOVIE_EXTENSIONS.includes(ext)) {
            movies.push(fullPath);
          }
        }
      }
    } catch (error: any) {
      logger.warn(`[MovieHandler] Failed to scan directory: ${dir}`, { error: error.message });
    }
  }

  await scanDir(MOVIES_DIR);
  return movies;
}

export async function batchProcessMovies(
  directory?: string,
  options: { concurrency?: number; autoOrganize?: boolean } = {},
): Promise<{ processed: number; failed: number; skipped: number }> {
  const { autoOrganize = true } = options;
  const movies = await scanMoviesDirectory(directory);

  logger.info(`[MovieHandler] Found ${movies.length} movies to process`);

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const moviePath of movies) {
    try {
      await handleMovieProcessing(
        { inputPath: moviePath, autoOrganize },
        {} as JobContext,
        null,
      );
      processed++;
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        skipped++;
      } else {
        failed++;
        logger.error(`[MovieHandler] Batch processing failed for: ${moviePath}`, {
          error: error.message,
        });
      }
    }
  }

  return { processed, failed, skipped };
}

export async function cleanupOrphanedThumbnails(directory?: string): Promise<number> {
  const MOVIES_DIR = directory || process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');
  let removed = 0;

  async function findThumbnailDirs(dir: string): Promise<string[]> {
    const result: string[] = [];
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return result;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.name === 'Thumbnails') {
        result.push(fullPath);
      } else {
        result.push(...await findThumbnailDirs(fullPath));
      }
    }
    return result;
  }

  const thumbDirs = await findThumbnailDirs(MOVIES_DIR);

  for (const thumbDir of thumbDirs) {
    const parentDir = path.dirname(thumbDir);

    let parentEntries;
    try {
      parentEntries = await fs.readdir(parentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    const videoFiles = parentEntries
      .filter(e => e.isFile() && MOVIE_EXTENSIONS.includes(path.extname(e.name).toLowerCase()))
      .map(e => path.basename(e.name, path.extname(e.name)));

    if (videoFiles.length === 0) {
      try {
        await fs.rm(thumbDir, { recursive: true, force: true });
        removed++;
        logger.info(`[MovieHandler] Removed orphaned Thumbnails dir: ${path.relative(MOVIES_DIR, thumbDir)}`);
      } catch (err: any) {
        logger.warn(`[MovieHandler] Failed to remove Thumbnails dir: ${thumbDir}`, { error: err.message });
      }
      continue;
    }

    let thumbEntries;
    try {
      thumbEntries = await fs.readdir(thumbDir, { withFileTypes: true });
    } catch {
      continue;
    }

    const videoBaseNames = new Set(videoFiles);

    for (const entry of thumbEntries) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(/^(.+?)_(thumb|sprite)\.jpg$/);
      if (!match) continue;
      if (!videoBaseNames.has(match[1])) {
        try {
          await fs.unlink(path.join(thumbDir, entry.name));
          removed++;
          logger.info(`[MovieHandler] Removed orphaned thumbnail: ${path.relative(MOVIES_DIR, path.join(thumbDir, entry.name))}`);
        } catch (err: any) {
          logger.warn(`[MovieHandler] Failed to remove orphaned thumbnail: ${entry.name}`, { error: err.message });
        }
      }
    }

    try {
      const remaining = await fs.readdir(thumbDir);
      if (remaining.length === 0) {
        await fs.rmdir(thumbDir);
        removed++;
        logger.info(`[MovieHandler] Removed empty Thumbnails dir: ${path.relative(MOVIES_DIR, thumbDir)}`);
      }
    } catch {}
  }

  return removed;
}

const PROTECTED_DIR_NAMES = new Set(['1_inbox', '2_processing', '3_complete']);

export async function cleanupEmptyDirectories(directory?: string): Promise<number> {
  const MOVIES_DIR = directory || process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');
  let removed = 0;

  async function hasVideoContent(dir: string): Promise<boolean> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (MOVIE_EXTENSIONS.includes(ext)) return true;
      } else if (entry.isDirectory() && entry.name !== 'Thumbnails') {
        if (await hasVideoContent(path.join(dir, entry.name))) return true;
      }
    }
    return false;
  }

  async function cleanDir(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'Thumbnails') {
        await cleanDir(path.join(dir, entry.name));
      }
    }

    if (dir !== MOVIES_DIR && !PROTECTED_DIR_NAMES.has(path.basename(dir)) && !(await hasVideoContent(dir))) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
        removed++;
        logger.info(`[MovieHandler] Removed empty directory: ${path.relative(MOVIES_DIR, dir)}`);
      } catch (err: any) {
        logger.warn(`[MovieHandler] Failed to remove empty directory: ${dir}`, { error: err.message });
      }
    }
  }

  await cleanDir(MOVIES_DIR);
  return removed;
}
