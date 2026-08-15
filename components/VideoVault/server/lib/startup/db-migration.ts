import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { eq, and, isNotNull } from 'drizzle-orm';
import { videos, directoryRoots } from '@shared/schema';
import { logger } from '../logger';
import { MOVIE_EXTENSIONS, extractMovieMetadata, detectQualityCategories } from '../../handlers/movie-handler';
import { readSidecar, writeSidecar } from '../sidecar';
import { extractCategoriesFromPath, mergeCategories } from '@shared/category-extractor';
import { generateVideoIdSync } from '@shared/video-id';

export async function ensureMoviesRoot(db: any, moviesDir: string): Promise<boolean> {
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

async function findThumbInDir(thumbsDir: string): Promise<{ thumbName: string; thumbFile: string } | null> {
  try {
    const files = await fs.readdir(thumbsDir);
    const thumbFile = files.find((f) => f.endsWith('_thumb.jpg'));
    if (thumbFile) {
      const thumbName = thumbFile.replace(/_thumb\.jpg$/, '');
      return { thumbName, thumbFile };
    }
  } catch {}
  return null;
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

export async function autoIndexLibrary(db: any, moviesDir: string): Promise<void> {
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
      try { await fs.access(thumbPath); hasThumb = true; } catch {}
      try { await fs.access(spritePath); hasSprite = true; } catch {}

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
      } catch {}

      const qualities = detectQualityCategories(metadata);
      const extracted = extractCategoriesFromPath(entry.name);
      const categories = mergeCategories(defaultCategories(qualities), extracted);
      await upsertVideo(db, {
        id, filename: entry.name, displayName: baseName,
        dbPath: `movies/${entry.name}`, stat, metadata, thumbUrl,
        categories, customCategories: {},
      });
      indexed++;
    } catch {
      errors++;
    }
  }

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
        continue;
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
        } catch {}
      }

      const sidecarCategories = sidecar?.categories || {};
      const qualities = detectQualityCategories(metadata);
      const extracted = extractCategoriesFromPath(videoFile.name, dirEntry.name);
      const base = mergeCategories(defaultCategories(qualities), extracted);
      const categories = mergeCategories(base, sidecarCategories as any);

      const customCategories = sidecar?.customCategories || {};
      await upsertVideo(db, {
        id, filename: videoFile.name, displayName,
        dbPath: `movies/${relVideoPath}`, stat, metadata, thumbUrl,
        categories, customCategories,
      });

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

export async function generateMoviesIndex(db: any, moviesDir?: string): Promise<void> {
  const MOVIES_DIR = moviesDir || process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');
  const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
  const indexPath = path.join(MEDIA_ROOT, 'movies_index.json');

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

  try {
    const entries = await fs.readdir(MOVIES_DIR, { withFileTypes: true });
    const result: any[] = [];

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
      } catch {}
    }

    await fs.writeFile(indexPath, JSON.stringify(result), 'utf-8');
    logger.info('[StartupTasks] Generated movies_index.json from filesystem', { count: result.length, path: indexPath });
  } catch (err: any) {
    logger.warn('[StartupTasks] Failed to generate movies_index.json from filesystem', { error: err.message });
  }
}
