import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';
import { ensureMoviesRoot, autoIndexLibrary, generateMoviesIndex } from './startup/db-migration';
import {
  drainInbox,
  organizeFlatFiles,
  generateMissingThumbnails,
  generateMissingSubdirThumbnails,
} from './startup/cache-warmup';

export { drainInbox, generateMoviesIndex };

export async function runStartupTasks(db: any): Promise<void> {
  const MOVIES_DIR = process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');

  try {
    await fs.access(MOVIES_DIR);
  } catch {
    logger.warn('[StartupTasks] MOVIES_DIR not accessible, skipping startup tasks', { directory: MOVIES_DIR });
    return;
  }

  const thumbsDir = path.join(MOVIES_DIR, 'Thumbnails');
  const inboxDir = path.join(MOVIES_DIR, '1_inbox');
  await fs.mkdir(thumbsDir, { recursive: true }).catch(() => {});
  await fs.mkdir(inboxDir, { recursive: true }).catch(() => {});
  if (process.env.INBOX_DIR) {
    await fs.mkdir(process.env.INBOX_DIR, { recursive: true }).catch(() => {});
  }
  logger.info('[StartupTasks] Directories ensured', { moviesDir: MOVIES_DIR, inboxDir: process.env.INBOX_DIR || inboxDir });

  if (db) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ok = await ensureMoviesRoot(db, MOVIES_DIR);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  await drainInbox(MOVIES_DIR);
  await organizeFlatFiles(MOVIES_DIR);

  if (db) {
    await autoIndexLibrary(db, MOVIES_DIR);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await generateMoviesIndex(db, MOVIES_DIR);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  await generateMissingThumbnails(MOVIES_DIR);
  await generateMissingSubdirThumbnails(MOVIES_DIR);

  try {
    const { cleanupEmptyDirectories } = await import('../handlers/movie-handler');
    const removed = await cleanupEmptyDirectories(MOVIES_DIR);
    if (removed > 0) {
      logger.info('[StartupTasks] Cleaned up empty directories', { removed });
    }
  } catch (err: any) {
    logger.warn('[StartupTasks] Empty directory cleanup failed', { error: err.message });
  }

  if (db) {
    await autoIndexLibrary(db, MOVIES_DIR);
    try {
      await generateMoviesIndex(db, MOVIES_DIR);
    } catch {}
  }
}
