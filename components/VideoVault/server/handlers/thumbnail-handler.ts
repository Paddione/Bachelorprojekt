import path from 'path';
import fs from 'fs/promises';
import { eq, and } from 'drizzle-orm';
import { thumbnails, videos, scanState, directoryRoots } from '@shared/schema';
import { logger } from '../lib/logger';
import type { JobContext } from '../lib/enhanced-job-queue';
import { fileURLToPath } from 'url';

// Dynamic import for MJS module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, '../../scripts/generate-thumbnails.mjs');

// Load the FFmpeg thumbnail generator
let ffmpegGenerateThumbnail: any = null;
async function loadThumbnailGenerator() {
  if (!ffmpegGenerateThumbnail) {
    const module = await import(scriptPath);
    ffmpegGenerateThumbnail = module.generateThumbnail;
  }
  return ffmpegGenerateThumbnail;
}

/**
 * Resolve a relative path to an absolute path using rootKey and MEDIA_ROOT
 * Tries multiple candidate paths to find where the file actually exists
 */
async function resolveInputPath(
  relativePath: string,
  rootKey: string | undefined,
  db: any,
): Promise<string | null> {
  const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'Bibliothek');

  // If inputPath is already absolute, verify it exists
  if (path.isAbsolute(relativePath)) {
    try {
      await fs.access(relativePath);
      return relativePath;
    } catch {
      logger.warn(`[ThumbnailHandler] Absolute path not found: ${relativePath}`);
      return null;
    }
  }

  // Build candidate root paths
  const candidateRoots: string[] = [MEDIA_ROOT];

  // Try to look up root from database if rootKey is provided
  if (rootKey && db) {
    try {
      const [root] = await db
        .select()
        .from(directoryRoots)
        .where(eq(directoryRoots.rootKey, rootKey))
        .limit(1);

      if (root) {
        // Add root name subdirectory
        candidateRoots.unshift(path.join(MEDIA_ROOT, root.name));

        // Add any stored directory paths
        if (root.directories && Array.isArray(root.directories)) {
          for (const dir of root.directories) {
            if (path.isAbsolute(dir)) {
              candidateRoots.push(dir);
            }
          }
        }
      }
    } catch (error: any) {
      logger.warn(`[ThumbnailHandler] Failed to look up root: ${rootKey}`, { error: error?.message });
    }
  }

  // Also try common fallback paths
  candidateRoots.push(
    path.join(process.cwd(), 'Bibliothek'),
    process.cwd(),
  );

  // Try each candidate to find where the file exists
  for (const rootPath of candidateRoots) {
    const candidate = path.join(rootPath, relativePath);
    try {
      await fs.access(candidate);
      logger.debug(`[ThumbnailHandler] Resolved path: ${relativePath} -> ${candidate}`);
      return candidate;
    } catch {
      // Continue to next candidate
    }
  }

  logger.error(`[ThumbnailHandler] Could not resolve path: ${relativePath}`, {
    rootKey,
    triedPaths: candidateRoots.map((r) => path.join(r, relativePath)),
  });
  return null;
}

export interface ThumbnailJobPayload {
  inputPath: string;
  videoId: string;
  fileHash: string;
  rootKey?: string;
  relativePath?: string;
}

/**
 * Thumbnail Generation Handler
 *
 * Generates thumbnails and sprites using FFmpeg, then:
 * 1. Copies files to hash-based directory structure
 * 2. Stores metadata in database
 * 3. Updates scan_state
 */
export async function handleThumbnailGeneration(
  data: ThumbnailJobPayload,
  context: JobContext,
  db: any,
) {
  const { inputPath, videoId, fileHash, rootKey, relativePath } = data;
  const thumbnailsDir = process.env.THUMBNAILS_DIR || path.join(process.cwd(), 'thumbnails');

  logger.info(`[ThumbnailHandler] Generating thumbnail for: ${inputPath}`, {
    videoId,
    fileHash,
    rootKey,
  });

  try {
    // 0. Resolve relative path to absolute path
    const resolvedPath = await resolveInputPath(inputPath, rootKey, db);
    if (!resolvedPath) {
      throw new Error(`Could not resolve input path: ${inputPath} (rootKey: ${rootKey})`);
    }

    logger.info(`[ThumbnailHandler] Resolved path: ${inputPath} -> ${resolvedPath}`);

    // 1. Generate thumbnails using existing FFmpeg script
    const generateThumbnail = await loadThumbnailGenerator();
    const result = await generateThumbnail(resolvedPath, { overwrite: false });

    if (result.skipped) {
      logger.info(`[ThumbnailHandler] Thumbnail already exists for: ${inputPath}`);
      return { status: 'skipped', reason: 'Already exists' };
    }

    // 2. Organize files into hash-based directory structure
    const hashPrefix = fileHash.substring(0, 2);
    const hashName = fileHash.substring(0, 16);
    const hashDir = path.join(thumbnailsDir, 'by-hash', hashPrefix);
    await fs.mkdir(hashDir, { recursive: true });

    const thumbDest = path.join(hashDir, `${hashName}_thumb.jpg`);
    const spriteDest = path.join(hashDir, `${hashName}_sprite.jpg`);

    // 3. Copy/move files to hash-based location
    await fs.copyFile(result.thumb, thumbDest);
    await fs.copyFile(result.sprite, spriteDest);

    // 4. Get file stats for metadata
    const thumbStats = await fs.stat(thumbDest);
    const spriteStats = await fs.stat(spriteDest);

    // 5. Calculate dimensions (assuming aspect ratio from video metadata)
    // Thumbnail: 320px width (from FFmpeg -q:v 2 setting)
    // Sprite: 160px per frame * 25 frames = 4000px width
    const thumbWidth = 320;
    const thumbHeight = 180; // Approximate 16:9 aspect ratio
    const spriteWidth = 160 * 25; // 25 frames at 160px each
    const spriteHeight = 180;

    // 6. Store thumbnail metadata in database
    if (db) {
      // Insert/update thumbnail record
      await db
        .insert(thumbnails)
        .values({
          videoId,
          filePath: path.relative(thumbnailsDir, thumbDest),
          type: 'thumbnail',
          width: thumbWidth,
          height: thumbHeight,
          format: 'jpeg',
          fileSize: thumbStats.size,
          quality: 0.9, // FFmpeg -q:v 2 is approximately 0.9 quality
          generatedBy: 'server-ffmpeg',
          generationParams: { midpoint: 0.5, quality: 2 },
        })
        .onConflictDoUpdate({
          target: [thumbnails.videoId, thumbnails.type],
          set: {
            filePath: path.relative(thumbnailsDir, thumbDest),
            fileSize: thumbStats.size,
            updatedAt: new Date(),
          },
        });

      // Insert/update sprite record
      await db
        .insert(thumbnails)
        .values({
          videoId,
          filePath: path.relative(thumbnailsDir, spriteDest),
          type: 'sprite',
          width: spriteWidth,
          height: spriteHeight,
          format: 'jpeg',
          fileSize: spriteStats.size,
          quality: 0.9,
          frameCount: 25,
          tileLayout: '25x1',
          generatedBy: 'server-ffmpeg',
          generationParams: { fps: '25/duration', quality: 2 },
        })
        .onConflictDoUpdate({
          target: [thumbnails.videoId, thumbnails.type],
          set: {
            filePath: path.relative(thumbnailsDir, spriteDest),
            fileSize: spriteStats.size,
            frameCount: 25,
            updatedAt: new Date(),
          },
        });

      // Update scan_state
      if (rootKey && relativePath) {
        await db
          .update(scanState)
          .set({ thumbnailGenerated: 'true' as any, spriteGenerated: 'true' as any })
          .where(and(eq(scanState.rootKey, rootKey), eq(scanState.relativePath, relativePath)));
      }

      logger.info(`[ThumbnailHandler] Successfully generated thumbnail for: ${inputPath}`, {
        videoId,
        thumbSize: thumbStats.size,
        spriteSize: spriteStats.size,
      });
    }

    // 7. Optionally clean up original files from Thumbnails/ directory
    // (Only if they're in the default location, not in the hash-based structure)
    try {
      if (
        !result.thumb.includes('/by-hash/') &&
        result.thumb.includes('/Thumbnails/') &&
        result.thumb !== thumbDest
      ) {
        await fs.unlink(result.thumb);
      }
      if (
        !result.sprite.includes('/by-hash/') &&
        result.sprite.includes('/Thumbnails/') &&
        result.sprite !== spriteDest
      ) {
        await fs.unlink(result.sprite);
      }
    } catch (cleanupError: any) {
      // Ignore cleanup errors
      logger.warn(`[ThumbnailHandler] Cleanup failed:`, cleanupError);
    }

    return {
      status: 'completed',
      thumbnailPath: thumbDest,
      spritePath: spriteDest,
      thumbnailSize: thumbStats.size,
      spriteSize: spriteStats.size,
    };
  } catch (error: any) {
    logger.error(`[ThumbnailHandler] Failed to generate thumbnail for: ${inputPath}`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}
