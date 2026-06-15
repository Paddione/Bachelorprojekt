import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';
import { RootsRegistry } from './roots-registry';

export const SIDECAR_FILENAME = 'metadata.json';

export interface SidecarData {
  version: number;
  id?: string;
  filename?: string;
  originalFilename?: string;
  displayName?: string;
  size?: number;
  lastModified?: string;
  metadata?: {
    duration: number;
    width: number;
    height: number;
    bitrate: number;
    codec: string;
    fps: number;
    aspectRatio: string;
  };
  categories?: Record<string, string[]>;
  customCategories?: Record<string, string[]>;
}

/**
 * Read metadata.json sidecar from a video directory.
 * Returns null if file doesn't exist or is malformed.
 */
export async function readSidecar(dirPath: string): Promise<SidecarData | null> {
  const filePath = path.join(dirPath, SIDECAR_FILENAME);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      logger.warn(`[Sidecar] Failed to read ${filePath}`, { error: err.message });
    }
    return null;
  }
}

/**
 * Write metadata.json sidecar to a video directory.
 * Non-fatal: logs warning on failure, never throws.
 */
export async function writeSidecar(dirPath: string, data: SidecarData): Promise<void> {
  const filePath = path.join(dirPath, SIDECAR_FILENAME);
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  } catch (err: any) {
    logger.warn(`[Sidecar] Failed to write ${filePath}`, { error: err.message });
  }
}

/**
 * Write a sidecar for a video. Resolves the directory via RootsRegistry,
 * falling back to MEDIA_ROOT for rootKey-less videos (backwards compat).
 * Non-fatal: logs warning on failure, skips silently for unresolvable roots.
 */
export async function syncVideoSidecar(video: {
  id: string;
  filename: string;
  displayName: string;
  path: string;
  rootKey?: string | null;
  size: number | bigint;
  lastModified: Date | string;
  metadata: any;
  categories: any;
  customCategories: any;
}): Promise<void> {
  let videoDir = RootsRegistry.resolveVideoDir({ rootKey: video.rootKey, path: video.path });

  if (!videoDir && !video.rootKey) {
    // Legacy fallback: no rootKey, registry has no fallback → use MEDIA_ROOT env
    const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
    videoDir = path.dirname(path.join(MEDIA_ROOT, video.path));
  }

  if (!videoDir) {
    // Unresolvable root — skip silently
    logger.debug(`[Sidecar] Skipping unresolvable root for video ${video.id}`, { rootKey: video.rootKey });
    return;
  }

  const existing = await readSidecar(videoDir);
  await writeSidecar(videoDir, {
    ...existing,
    version: 1,
    id: video.id,
    filename: video.filename,
    displayName: video.displayName,
    size: Number(video.size),
    lastModified: video.lastModified instanceof Date ? video.lastModified.toISOString() : String(video.lastModified),
    metadata: video.metadata,
    categories: video.categories,
    customCategories: video.customCategories,
  });
}
