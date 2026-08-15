import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db';
import { directoryRoots } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { pathToFileURL } from 'url';
import { jobQueue } from '../lib/job-queue';
import { logger } from '../lib/logger';

type ThumbnailRequestBody = {
  rootKey?: string;
  relativePath?: string;
  absolutePath?: string; // Optional: skip db lookup if provided
};

// Deduplication: track pending/in-progress paths to avoid duplicate jobs
const pendingPaths = new Set<string>();
const PENDING_CLEANUP_MS = 60000; // Clear pending status after 1 minute

type GenerateThumbnailResult = {
  thumbnailPath?: string;
  success?: boolean;
  message?: string;
};

type GenerateThumbnailFn = (
  inputPath: string,
  options: { overwrite: boolean },
) => Promise<GenerateThumbnailResult>;

let generateThumbnailCached: GenerateThumbnailFn | null = null;

async function loadGenerateThumbnail(): Promise<GenerateThumbnailFn> {
  if (generateThumbnailCached) {
    return generateThumbnailCached;
  }

  const modulePath = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    'scripts',
    'generate-thumbnails.mjs',
  );
  const moduleUrl = pathToFileURL(modulePath).href;
  const mod = await import(moduleUrl);
  generateThumbnailCached = mod.generateThumbnail as GenerateThumbnailFn;
  return generateThumbnailCached;
}

// Register handler
jobQueue.registerHandler('generate-thumbnail', async (data: { inputPath: string }) => {
  const generateThumbnail = await loadGenerateThumbnail();
  return await generateThumbnail(data.inputPath, { overwrite: false });
});

export async function generateThumbnailRoute(
  req: Request<unknown, unknown, ThumbnailRequestBody>,
  res: Response,
) {
  const { rootKey, relativePath, absolutePath } = req.body;

  // Validate: need either absolutePath or (rootKey + relativePath)
  if (!absolutePath && (!rootKey || !relativePath)) {
    return res.status(400).json({ error: 'Either absolutePath or (rootKey and relativePath) are required' });
  }

  try {
    let foundPath: string | null = null;

    // If absolutePath is provided, use it directly (skip db lookup)
    if (absolutePath) {
      try {
        await fs.access(absolutePath);
        foundPath = absolutePath;
      } catch {
        return res.status(404).json({ error: 'File not found at absolutePath' });
      }
    } else {
      const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'Bibliothek');

      // Try database lookup first if available
      if (db) {
        try {
          const [root] = await db
            .select()
            .from(directoryRoots)
            .where(eq(directoryRoots.rootKey, rootKey!))
            .limit(1);

          if (root) {
            // Potential base paths to check for the file
            const candidateRoots = [
              path.join(MEDIA_ROOT, root.name),
              path.join(MEDIA_ROOT),
              path.join(process.cwd(), root.name),
              process.cwd(),
            ];

            if (root.directories) {
              for (const dir of root.directories) {
                if (path.isAbsolute(dir)) {
                  candidateRoots.push(dir);
                }
              }
            }

            for (const rootPath of candidateRoots) {
              const candidate = path.join(rootPath, relativePath!);
              try {
                await fs.access(candidate);
                foundPath = candidate;
                break;
              } catch {
                // continue
              }
            }
          }
        } catch (dbError) {
          logger.warn('[Thumbnails] Database query failed, trying fallback', { error: String(dbError) });
        }
      }

      // Fallback: try common paths without database lookup
      if (!foundPath) {
        const fallbackPaths = [
          path.join(MEDIA_ROOT, relativePath!),
          path.join(process.cwd(), relativePath!),
          // Try with rootKey as subdirectory name
          path.join(MEDIA_ROOT, rootKey!, relativePath!),
          path.join(process.cwd(), rootKey!, relativePath!),
        ];

        for (const candidate of fallbackPaths) {
          try {
            await fs.access(candidate);
            foundPath = candidate;
            logger.info('[Thumbnails] Found file via fallback path', { path: candidate });
            break;
          } catch {
            // continue
          }
        }
      }

      if (!foundPath) {
        return res.status(404).json({ error: 'File not found in any root directory' });
      }
    }

    // Deduplication check: if this path is already being processed, skip
    if (pendingPaths.has(foundPath)) {
      return res.status(202).json({
        success: true,
        message: 'Thumbnail generation already in progress for this file',
        deduplicated: true,
      });
    }

    // Mark as pending and schedule cleanup
    pendingPaths.add(foundPath);
    setTimeout(() => pendingPaths.delete(foundPath!), PENDING_CLEANUP_MS);

    // 2. Enqueue job
    const job = jobQueue.add('generate-thumbnail', { inputPath: foundPath });

    // Clear pending status when job completes
    jobQueue.once('jobCompleted', (completedJob) => {
      if (completedJob.id === job.id) {
        pendingPaths.delete(foundPath!);
      }
    });
    jobQueue.once('jobFailed', (failedJob) => {
      if (failedJob.id === job.id) {
        pendingPaths.delete(foundPath!);
      }
    });

    res.status(202).json({
      success: true,
      message: 'Thumbnail generation queued',
      jobId: job.id,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error('[Thumbnails] Generation failed', { message: error.message }, error);
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Unknown error' });
  }
}
