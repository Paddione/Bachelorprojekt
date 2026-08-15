import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { eq, and } from 'drizzle-orm';
import { thumbnails } from '@shared/schema';
import { logger } from '../lib/logger';
import { asyncHandler } from '../middleware/async-error-handler';

const router = Router();

/**
 * GET /api/thumbnails/:videoId
 *
 * Serve thumbnail or sprite file for a video
 * Query params:
 *   - type: 'thumbnail' | 'sprite' (default: 'thumbnail')
 */
router.get(
  '/:videoId',
  asyncHandler(async (req: Request, res: Response) => {
    const { videoId } = req.params;
    const { type = 'thumbnail' } = req.query;

    // @ts-ignore - db injected by server
    const db = req.app.locals.db;

    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    // Validate type
    if (type !== 'thumbnail' && type !== 'sprite') {
      return res.status(400).json({ error: 'Invalid type. Must be "thumbnail" or "sprite"' });
    }

    // Fetch thumbnail metadata from database
    const [record] = await db
      .select()
      .from(thumbnails)
      .where(and(eq(thumbnails.videoId, videoId), eq(thumbnails.type, type as string)))
      .limit(1);

    if (!record) {
      return res.status(404).json({
        error: 'Thumbnail not found',
        message: `No ${type} found for video ${videoId}`,
      });
    }

    // Resolve file path
    const thumbnailsDir = process.env.THUMBNAILS_DIR || path.join(process.cwd(), 'thumbnails');
    const filePath = path.join(thumbnailsDir, record.filePath);

    try {
      // Check if file exists
      await fs.access(filePath);

      // Set cache headers (1 year for immutable content)
      res.set({
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': `image/${record.format}`,
        'Content-Length': record.fileSize.toString(),
        'X-Generated-By': record.generatedBy,
      });

      // Send file
      res.sendFile(filePath);
    } catch (error: any) {
      logger.error(`[ThumbnailsV2] File not found: ${filePath}`, { error: error.message });
      res.status(404).json({
        error: 'Thumbnail file not found',
        message: 'Thumbnail metadata exists but file is missing',
      });
    }
  }),
);

/**
 * GET /api/thumbnails/:videoId/metadata
 *
 * Get thumbnail metadata for a video (without serving the file)
 */
router.get(
  '/:videoId/metadata',
  asyncHandler(async (req: Request, res: Response) => {
    const { videoId } = req.params;

    // @ts-ignore - db injected by server
    const db = req.app.locals.db;

    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    // Fetch all thumbnail records for this video
    const records = await db.select().from(thumbnails).where(eq(thumbnails.videoId, videoId));

    if (records.length === 0) {
      return res.status(404).json({
        error: 'No thumbnails found',
        message: `No thumbnails found for video ${videoId}`,
      });
    }

    // Format response
    const response = {
      videoId,
      thumbnails: records.map((r: any) => ({
        type: r.type,
        width: r.width,
        height: r.height,
        format: r.format,
        fileSize: r.fileSize,
        quality: r.quality,
        frameCount: r.frameCount,
        tileLayout: r.tileLayout,
        generatedBy: r.generatedBy,
        url: `/api/thumbnails/${videoId}?type=${r.type}`,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };

    res.json(response);
  }),
);

/**
 * DELETE /api/thumbnails/:videoId
 *
 * Delete thumbnails for a video (both database records and files)
 * Query params:
 *   - type: 'thumbnail' | 'sprite' | 'all' (default: 'all')
 */
router.delete(
  '/:videoId',
  asyncHandler(async (req: Request, res: Response) => {
    const { videoId } = req.params;
    const { type = 'all' } = req.query;

    // @ts-ignore - db injected by server
    const db = req.app.locals.db;

    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const thumbnailsDir = process.env.THUMBNAILS_DIR || path.join(process.cwd(), 'thumbnails');

    // Fetch records to delete
    let records;
    if (type === 'all') {
      records = await db.select().from(thumbnails).where(eq(thumbnails.videoId, videoId));
    } else {
      records = await db
        .select()
        .from(thumbnails)
        .where(and(eq(thumbnails.videoId, videoId), eq(thumbnails.type, type as string)));
    }

    if (records.length === 0) {
      return res.status(404).json({ error: 'No thumbnails found to delete' });
    }

    // Delete files
    const deletedFiles: string[] = [];
    for (const record of records) {
      const filePath = path.join(thumbnailsDir, record.filePath);
      try {
        await fs.unlink(filePath);
        deletedFiles.push(record.filePath);
      } catch (error: any) {
        logger.warn(`[ThumbnailsV2] Failed to delete file: ${filePath}`, {
          error: error.message,
        });
      }
    }

    // Delete database records
    if (type === 'all') {
      await db.delete(thumbnails).where(eq(thumbnails.videoId, videoId));
    } else {
      await db
        .delete(thumbnails)
        .where(and(eq(thumbnails.videoId, videoId), eq(thumbnails.type, type as string)));
    }

    res.json({
      success: true,
      deletedCount: records.length,
      deletedFiles,
    });
  }),
);

export default router;
