import fs from 'fs/promises';
import path from 'path';
import { scanMoviesDirectory, cleanupOrphanedThumbnails, cleanupEmptyDirectories } from '../handlers/movie-handler';
import { drainInbox } from './startup-tasks';
import { jobQueue } from './job-queue';
import { logger } from './logger';

const SKIP_DIRS = ['Thumbnails', '1_inbox', '2_processing', '3_complete'];

type MovieWatcherOptions = {
  pollIntervalMs?: number;
  stabilityMs?: number;
  autoOrganize?: boolean;
  backfillMissingThumbnails?: boolean;
};

type PendingInfo = {
  size: number;
  mtimeMs: number;
  firstSeen: number;
  lastSeen: number;
};

const DEFAULT_POLL_INTERVAL_MS = parseInt(process.env.MOVIE_WATCHER_INTERVAL_MS || '15000', 10);
const DEFAULT_STABILITY_MS = parseInt(process.env.MOVIE_WATCHER_STABILITY_MS || '30000', 10);
const DEFAULT_AUTO_ORGANIZE = process.env.MOVIE_WATCHER_AUTO_ORGANIZE !== '0';
const DEFAULT_BACKFILL = process.env.MOVIE_WATCHER_BACKFILL === '1';

export function startMovieWatcher(options: MovieWatcherOptions = {}) {
  if (process.env.NODE_ENV === 'test' || process.env.FAST_TESTS === '1') {
    logger.info('[MovieWatcher] Skipping movie watcher in test mode');
    return;
  }

  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const stabilityMs = options.stabilityMs ?? DEFAULT_STABILITY_MS;
  const autoOrganize = options.autoOrganize ?? DEFAULT_AUTO_ORGANIZE;
  const backfillMissingThumbnails = options.backfillMissingThumbnails ?? DEFAULT_BACKFILL;
  const moviesDir = process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');

  const knownFiles = new Set<string>();
  const pending = new Map<string, PendingInfo>();
  let timer: NodeJS.Timeout | null = null;

  const seedKnownFiles = async () => {
    try {
      const movies = await scanMoviesDirectory(moviesDir, true, SKIP_DIRS);
      movies.forEach((movie) => knownFiles.add(movie));
      logger.info('[MovieWatcher] Seeded existing movies', {
        directory: moviesDir,
        count: movies.length,
      });
    } catch (error: any) {
      logger.warn('[MovieWatcher] Failed to seed existing movies', {
        directory: moviesDir,
        error: error.message,
      });
    }
  };

  const queueMovie = (moviePath: string) => {
    jobQueue.add('process-movie', { inputPath: moviePath, autoOrganize });
    knownFiles.add(moviePath);
    pending.delete(moviePath);
    logger.info('[MovieWatcher] Queued new movie for processing', { moviePath });
  };

  const hasThumbnails = async (moviePath: string): Promise<boolean> => {
    const movieDir = path.dirname(moviePath);
    const baseName = path.basename(moviePath, path.extname(moviePath));
    const thumbsDir = path.join(movieDir, 'Thumbnails');

    // First: check exact name match (fast path)
    const thumbPath = path.join(thumbsDir, `${baseName}_thumb.jpg`);
    try {
      await fs.access(thumbPath);
      return true;
    } catch { /* try fallback */ }

    // Fallback: check if ANY _thumb.jpg exists in the Thumbnails dir.
    // Many movies have thumbnails named differently from the video file
    // (e.g., video: slug.mp4, thumb: "Display Name_thumb.jpg").
    try {
      const files = await fs.readdir(thumbsDir);
      return files.some((f) => f.endsWith('_thumb.jpg'));
    } catch {
      return false;
    }
  };

  const updatePending = (moviePath: string, stat: { size: number; mtimeMs: number }, now: number) => {
    pending.set(moviePath, {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      firstSeen: now,
      lastSeen: now,
    });
  };

  const scanAndQueue = async () => {
    const now = Date.now();
    const movies = await scanMoviesDirectory(moviesDir, true, SKIP_DIRS);
    const currentSet = new Set(movies);

    for (const moviePath of movies) {
      if (knownFiles.has(moviePath)) continue;

      let stat: { size: number; mtimeMs: number };
      try {
        const fileStat = await fs.stat(moviePath);
        stat = { size: fileStat.size, mtimeMs: fileStat.mtimeMs };
      } catch (error: any) {
        logger.warn('[MovieWatcher] Failed to stat movie file', { moviePath, error: error.message });
        continue;
      }

      if (await hasThumbnails(moviePath)) {
        knownFiles.add(moviePath);
        pending.delete(moviePath);
        continue;
      }

      const pendingInfo = pending.get(moviePath);
      if (!pendingInfo) {
        updatePending(moviePath, stat, now);
        continue;
      }

      if (pendingInfo.size === stat.size && pendingInfo.mtimeMs === stat.mtimeMs) {
        if (now - pendingInfo.firstSeen >= stabilityMs) {
          queueMovie(moviePath);
        } else {
          pendingInfo.lastSeen = now;
        }
      } else {
        updatePending(moviePath, stat, now);
      }
    }

    for (const pendingPath of pending.keys()) {
      if (!currentSet.has(pendingPath)) {
        pending.delete(pendingPath);
      }
    }
  };

  const start = async () => {
    try {
      await fs.access(moviesDir);
    } catch (error: any) {
      logger.warn('[MovieWatcher] Movies directory not accessible; watcher disabled', {
        directory: moviesDir,
        error: error.message,
      });
      return;
    }

    await seedKnownFiles();
    if (backfillMissingThumbnails) {
      try {
        const movies = await scanMoviesDirectory(moviesDir, true, SKIP_DIRS);
        let queued = 0;

        for (const moviePath of movies) {
          if (await hasThumbnails(moviePath)) {
            knownFiles.add(moviePath);
            continue;
          }

          queueMovie(moviePath);
          queued++;
        }

        logger.info('[MovieWatcher] Backfill queued movies missing thumbnails', { queued });
      } catch (error: any) {
        logger.warn('[MovieWatcher] Backfill scan failed', { error: error.message });
      }
    }

    let scanCount = 0;
    let scanning = false;
    const cleanupEveryNScans = parseInt(process.env.MOVIE_WATCHER_CLEANUP_SCANS || '240', 10);

    const runCleanup = async () => {
      const thumbsRemoved = await cleanupOrphanedThumbnails(moviesDir);
      const dirsRemoved = await cleanupEmptyDirectories(moviesDir);
      if (thumbsRemoved > 0 || dirsRemoved > 0) {
        logger.info('[MovieWatcher] Cleanup completed', { thumbsRemoved, dirsRemoved });
      }
    };

    timer = setInterval(async () => {
      if (scanning) return;
      scanning = true;
      try {
        // Move any new files from 1_inbox/ to movies root before scanning
        await drainInbox(moviesDir);
        await scanAndQueue();
        scanCount++;
        if (scanCount % cleanupEveryNScans === 0) {
          await runCleanup();
        }
      } catch (error: any) {
        logger.warn('[MovieWatcher] Scan cycle failed', { error: error.message });
      } finally {
        scanning = false;
      }
    }, pollIntervalMs);

    logger.info('[MovieWatcher] Watching for new movies', {
      directory: moviesDir,
      pollIntervalMs,
      stabilityMs,
      cleanupEveryNScans,
    });
  };

  start().catch((error) => {
    logger.warn('[MovieWatcher] Failed to start', { error: error.message });
  });

  const rescan = async (): Promise<number> => {
    logger.info('[MovieWatcher] Manual rescan triggered');
    const movies = await scanMoviesDirectory(moviesDir, true, SKIP_DIRS);
    let queued = 0;

    for (const moviePath of movies) {
      if (await hasThumbnails(moviePath)) {
        knownFiles.add(moviePath);
        continue;
      }

      queueMovie(moviePath);
      queued++;
    }

    logger.info('[MovieWatcher] Manual rescan completed', { queued });
    return queued;
  };

  return {
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    rescan,
  };
}

export type MovieWatcher = ReturnType<typeof startMovieWatcher>;

let _instance: MovieWatcher | undefined;

export function setMovieWatcherInstance(watcher: MovieWatcher) {
  _instance = watcher;
}

export function getMovieWatcherInstance(): MovieWatcher | undefined {
  return _instance;
}
