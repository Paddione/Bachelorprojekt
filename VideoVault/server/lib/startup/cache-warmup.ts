import path from 'path';
import fs from 'fs/promises';
import { logger } from '../logger';
import { MOVIE_EXTENSIONS, generateMovieThumbnail, parseMovieFilename, generateOrganizedPath } from '../../handlers/movie-handler';
import { writeSidecar } from '../sidecar';

const _failedStatNames = new Set<string>();

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
    } catch {}

    const { title, year } = parseMovieFilename(name);
    const organizedFolder = generateOrganizedPath(title, year);
    const organizedDir = path.join(moviesDir, organizedFolder);
    try {
      const dirEntries = await fs.readdir(organizedDir);
      const hasVideo = dirEntries.some(
        (e: string) => MOVIE_EXTENSIONS.includes(path.extname(e).toLowerCase()),
      );
      if (hasVideo) {
        try {
          await fs.unlink(src);
          logger.info(`[StartupTasks] Inbox cleanup: removed ${name} (already organized in ${organizedFolder}/)`);
        } catch (unlinkErr: any) {
          logger.warn(`[StartupTasks] Inbox cleanup: failed to remove ${name}`, { error: unlinkErr.message });
        }
        continue;
      }
    } catch {}

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

export async function organizeFlatFiles(moviesDir: string): Promise<void> {
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

    try {
      await fs.access(targetDir);
      const dirContents = await fs.readdir(targetDir);
      const hasVideo = dirContents.some(
        (e: string) => MOVIE_EXTENSIONS.includes(path.extname(e).toLowerCase()),
      );
      if (hasVideo) {
        try {
          await fs.unlink(srcPath);
          organized++;
          logger.info(`[StartupTasks] Removed flat duplicate: ${entry.name} (already in ${folderName}/)`);
        } catch (err: any) {
          logger.warn(`[StartupTasks] Failed to remove flat duplicate: ${entry.name}`, { error: err.message });
        }
      }
      continue;
    } catch {}

    try {
      const thumbsDir = path.join(targetDir, 'Thumbnails');
      await fs.mkdir(thumbsDir, { recursive: true });

      await fs.rename(srcPath, targetPath);

      const baseName = path.basename(entry.name, ext);
      for (const suffix of ['_thumb.jpg', '_sprite.jpg']) {
        const oldThumb = path.join(rootThumbsDir, `${baseName}${suffix}`);
        const newThumb = path.join(thumbsDir, `${folderName}${suffix}`);
        try {
          await fs.access(oldThumb);
          await fs.rename(oldThumb, newThumb);
        } catch {}
      }

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

export async function generateMissingThumbnails(moviesDir: string): Promise<void> {
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
    try { await fs.access(thumbPath); hasThumb = true; } catch {}
    try { await fs.access(spritePath); hasSprite = true; } catch {}

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

export async function generateMissingSubdirThumbnails(moviesDir: string): Promise<void> {
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
    try { await fs.access(thumbPath); hasThumb = true; } catch {}
    try { await fs.access(spritePath); hasSprite = true; } catch {}

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
