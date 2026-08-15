import { Router, Request, Response } from 'express';
import { eq, and, inArray } from 'drizzle-orm';
import { scanState, type InsertDBScanState } from '@shared/schema';
import { asyncHandler } from '../middleware/async-error-handler';

const router = Router();

/**
 * GET /api/scan-state/:rootKey
 *
 * Get scan state for all files in a directory root
 */
router.get(
  '/:rootKey',
  asyncHandler(async (req: Request, res: Response) => {
    const { rootKey } = req.params;

    // @ts-ignore - db injected by server
    const db = req.app.locals.db;

    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const records = await db.select().from(scanState).where(eq(scanState.rootKey, rootKey));

    res.json({
      rootKey,
      count: records.length,
      records,
    });
  }),
);

/**
 * POST /api/scan-state/update
 *
 * Update or insert scan state record for a file
 */
router.post(
  '/update',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      rootKey,
      relativePath,
      fileHash,
      fileSize,
      lastModified,
      metadataExtracted,
      thumbnailGenerated,
      spriteGenerated,
    } = req.body;

    // @ts-ignore - db injected by server
    const db = req.app.locals.db;

    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    // Validate required fields
    if (!rootKey || !relativePath || !fileHash) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['rootKey', 'relativePath', 'fileHash'],
      });
    }

    const data: InsertDBScanState = {
      rootKey,
      relativePath,
      fileHash,
      fileSize: fileSize || 0,
      lastModified: lastModified ? new Date(lastModified) : new Date(),
      metadataExtracted: metadataExtracted ? 'true' : 'false',
      thumbnailGenerated: thumbnailGenerated ? 'true' : 'false',
      spriteGenerated: spriteGenerated ? 'true' : 'false',
      lastScannedAt: new Date(),
    };

    // Upsert (insert or update on conflict)
    await db
      .insert(scanState)
      .values(data)
      .onConflictDoUpdate({
        target: [scanState.rootKey, scanState.relativePath],
        set: {
          fileHash,
          fileSize: data.fileSize,
          lastModified: data.lastModified,
          metadataExtracted: data.metadataExtracted,
          thumbnailGenerated: data.thumbnailGenerated,
          spriteGenerated: data.spriteGenerated,
          lastScannedAt: data.lastScannedAt,
        },
      });

    res.json({ success: true });
  }),
);

/**
 * POST /api/scan-state/batch-update
 *
 * Batch update multiple scan state records
 */
router.post(
  '/batch-update',
  asyncHandler(async (req: Request, res: Response) => {
    const { records } = req.body;

    // @ts-ignore - db injected by server
    const db = req.app.locals.db;

    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Records must be a non-empty array' });
    }

    // Process in batches of 100
    const BATCH_SIZE = 100;
    let updatedCount = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        const data: InsertDBScanState = {
          rootKey: record.rootKey,
          relativePath: record.relativePath,
          fileHash: record.fileHash,
          fileSize: record.fileSize || 0,
          lastModified: record.lastModified ? new Date(record.lastModified) : new Date(),
          metadataExtracted: record.metadataExtracted ? 'true' : 'false',
          thumbnailGenerated: record.thumbnailGenerated ? 'true' : 'false',
          spriteGenerated: record.spriteGenerated ? 'true' : 'false',
          lastScannedAt: new Date(),
        };

        await db
          .insert(scanState)
          .values(data)
          .onConflictDoUpdate({
            target: [scanState.rootKey, scanState.relativePath],
            set: {
              fileHash: data.fileHash,
              fileSize: data.fileSize,
              lastModified: data.lastModified,
              metadataExtracted: data.metadataExtracted,
              thumbnailGenerated: data.thumbnailGenerated,
              spriteGenerated: data.spriteGenerated,
              lastScannedAt: data.lastScannedAt,
            },
          });

        updatedCount++;
      }
    }

    res.json({ success: true, updatedCount });
  }),
);

/**
 * POST /api/scan-state/delete
 *
 * Delete scan state records for removed files
 */
router.post(
  '/delete',
  asyncHandler(async (req: Request, res: Response) => {
    const { rootKey, paths } = req.body;

    // @ts-ignore - db injected by server
    const db = req.app.locals.db;

    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    if (!rootKey) {
      return res.status(400).json({ error: 'rootKey is required' });
    }

    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'paths must be a non-empty array' });
    }

    // Delete records
    await db
      .delete(scanState)
      .where(and(eq(scanState.rootKey, rootKey), inArray(scanState.relativePath, paths)));

    res.json({
      success: true,
      deletedCount: paths.length,
    });
  }),
);

/**
 * GET /api/scan-state/:rootKey/stats
 *
 * Get statistics for a directory root
 */
router.get(
  '/:rootKey/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const { rootKey } = req.params;

    // @ts-ignore - db injected by server
    const db = req.app.locals.db;

    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const records = await db.select().from(scanState).where(eq(scanState.rootKey, rootKey));

    const stats = {
      total: records.length,
      metadataExtracted: records.filter((r: any) => r.metadataExtracted === 'true').length,
      thumbnailGenerated: records.filter((r: any) => r.thumbnailGenerated === 'true').length,
      spriteGenerated: records.filter((r: any) => r.spriteGenerated === 'true').length,
      pending: records.filter(
        (r: any) =>
          r.metadataExtracted === 'false' ||
          r.thumbnailGenerated === 'false' ||
          r.spriteGenerated === 'false',
      ).length,
    };

    res.json({
      rootKey,
      stats,
    });
  }),
);

/**
 * DELETE /api/scan-state/:rootKey
 *
 * Delete all scan state records for a root (when root is removed)
 */
router.delete(
  '/:rootKey',
  asyncHandler(async (req: Request, res: Response) => {
    const { rootKey } = req.params;

    // @ts-ignore - db injected by server
    const db = req.app.locals.db;

    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const result = await db.delete(scanState).where(eq(scanState.rootKey, rootKey));

    res.json({
      success: true,
      deletedCount: result.rowCount || 0,
    });
  }),
);

export default router;
