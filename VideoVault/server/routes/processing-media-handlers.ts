import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { videos } from '@shared/schema';
import {
  scanMoviesDirectory,
  extractMovieMetadata,
  detectQualityCategories,
  MOVIE_EXTENSIONS,
} from '../handlers/movie-handler';
import { scanAudiobooksDirectory } from '../handlers/audiobook-handler';
import { scanEbooksDirectory } from '../handlers/ebook-handler';
import { jobQueue } from '../lib/job-queue';
import { logger } from '../lib/logger';
import { readSidecar, writeSidecar } from '../lib/sidecar';
import { generateVideoIdSync } from '@shared/video-id';
import { db } from '../db';
import { HDD_EXT_DIR, MEDIA_ROOT } from './processing-helpers';

export async function handleAudiobooksScan(req: Request, res: Response) {
  try {
    const { directory } = req.body;
    const audiobooks = await scanAudiobooksDirectory(directory);
    res.json({ success: true, count: audiobooks.length, audiobooks });
  } catch (error: any) {
    logger.error('[Processing] Audiobook scan failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

export async function handleAudiobooksProcess(req: Request, res: Response) {
  try {
    const { inputPath, autoOrganize = true, rootKey } = req.body;
    if (!inputPath) {
      return res.status(400).json({ error: 'inputPath is required' });
    }
    const job = jobQueue.add('process-audiobook', { inputPath, autoOrganize, rootKey });
    res.status(202).json({ success: true, message: 'Audiobook processing queued', jobId: job.id });
  } catch (error: any) {
    logger.error('[Processing] Audiobook process failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

export async function handleAudiobooksBatch(req: Request, res: Response) {
  try {
    const { directory, autoOrganize = true } = req.body;
    const audiobooks = await scanAudiobooksDirectory(directory);
    if (audiobooks.length === 0) {
      return res.json({ success: true, message: 'No audiobooks found to process', count: 0 });
    }
    const jobs = audiobooks.map((ab) =>
      jobQueue.add('process-audiobook', { inputPath: ab.path, autoOrganize }),
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
}

export async function handleEbooksScan(req: Request, res: Response) {
  try {
    const { directory } = req.body;
    const ebooks = await scanEbooksDirectory(directory);
    res.json({ success: true, count: ebooks.length, ebooks });
  } catch (error: any) {
    logger.error('[Processing] Ebook scan failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

export async function handleEbooksProcess(req: Request, res: Response) {
  try {
    const { inputPath, autoOrganize = true, rootKey } = req.body;
    if (!inputPath) {
      return res.status(400).json({ error: 'inputPath is required' });
    }
    const job = jobQueue.add('process-ebook', { inputPath, autoOrganize, rootKey });
    res.status(202).json({ success: true, message: 'Ebook processing queued', jobId: job.id });
  } catch (error: any) {
    logger.error('[Processing] Ebook process failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}

export async function handleEbooksBatch(req: Request, res: Response) {
  try {
    const { directory, autoOrganize = true } = req.body;
    const ebooks = await scanEbooksDirectory(directory);
    if (ebooks.length === 0) {
      return res.json({ success: true, message: 'No ebooks found to process', count: 0 });
    }
    const jobs = ebooks.map((eb) =>
      jobQueue.add('process-ebook', { inputPath: eb.path, autoOrganize }),
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
}

export async function handleHddExtProcess(req: Request, res: Response) {
  try {
    const { filePath } = req.body;
    if (filePath) {
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

    const files = await scanMoviesDirectory(HDD_EXT_DIR, true, ['Thumbnails']);
    if (files.length === 0) {
      return res.json({ success: true, message: 'No video files found in HDD-ext', count: 0 });
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
}

export async function handleHddExtRescan(req: Request, res: Response) {
  try {
    const files = await scanMoviesDirectory(HDD_EXT_DIR, true, ['Thumbnails']);
    let queued = 0;
    for (const filePath of files) {
      const baseName = path.basename(filePath, path.extname(filePath));
      const dir = path.dirname(filePath);
      const thumbPath = path.join(dir, 'Thumbnails', `${baseName}_thumb.jpg`);
      let hasThumb = false;
      try { await fs.access(thumbPath); hasThumb = true; } catch {}
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
}

export async function handleHddExtIndex(req: Request, res: Response) {
  try {
    const { forceReindex = false } = req.body;
    await fs.access(HDD_EXT_DIR);

    let indexed = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ path: string; error: string }> = [];
    const pendingEntries: Array<{ videoPath: string; dir: string; videoFileName: string }> = [];

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
        pendingEntries.push({
          videoPath: path.join(dir, videoFile.name),
          dir,
          videoFileName: videoFile.name,
        });
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'Thumbnails') {
          await scanDir(path.join(dir, entry.name));
        }
      }
    }

    await scanDir(HDD_EXT_DIR);

    const CONCURRENCY = 4;
    for (let i = 0; i < pendingEntries.length; i += CONCURRENCY) {
      const batch = pendingEntries.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async ({ videoPath, dir, videoFileName }) => {
          try {
            const relDir = path.relative(MEDIA_ROOT, dir);
            const relVideoPath = path.join(relDir, videoFileName);
            const baseName = path.basename(videoFileName, path.extname(videoFileName));
            const thumbPath = path.join(dir, 'Thumbnails', `${baseName}_thumb.jpg`);
            let thumbExists = false;
            try { await fs.access(thumbPath); thumbExists = true; } catch {}
            if (!thumbExists) {
              skipped++;
              return;
            }
            const id = generateVideoIdSync(crypto, 'hdd-ext', relVideoPath);
            if (!forceReindex && db) {
              const existing = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, id)).limit(1);
              if (existing.length > 0) {
                skipped++;
                return;
              }
            }

            const stat = await fs.stat(videoPath);
            const thumbUrl = `/media/${relDir}/Thumbnails/${encodeURIComponent(baseName)}_thumb.jpg`;

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
              logger.warn(`[Processing] ffprobe failed for ${relVideoPath}`, { error: probeErr.message });
            }

            const sidecar = await readSidecar(dir);
            const defaultCategories = { age: [] as string[], physical: [] as string[], ethnicity: [] as string[], relationship: [] as string[], acts: [] as string[], setting: [] as string[], quality: [] as string[], performer: [] as string[] };
            const categories = (sidecar?.categories || defaultCategories) as typeof defaultCategories;
            const customCategories = sidecar?.customCategories || {};

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
        }),
      );
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
}

export async function handleScanAll(req: Request, res: Response) {
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
}

export async function handleStats(req: Request, res: Response) {
  try {
    const stats = jobQueue.getStats();
    res.json({ success: true, stats });
  } catch (error: any) {
    logger.error('[Processing] Stats failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
}
