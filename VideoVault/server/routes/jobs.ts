import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-error-handler';
import { logger } from '../lib/logger';

const router = Router();

/**
 * POST /api/jobs/enqueue
 *
 * Enqueue a new background job
 */
router.post(
  '/enqueue',
  asyncHandler(async (req: Request, res: Response) => {
    const { type, videoId, rootKey, relativePath, priority, payload, maxAttempts } = req.body;

    // @ts-ignore - jobQueue injected by server
    const jobQueue = req.app.locals.jobQueue;

    if (!jobQueue) {
      return res.status(503).json({ error: 'Job queue unavailable' });
    }

    // Validate required fields
    if (!type) {
      return res.status(400).json({ error: 'Job type is required' });
    }

    try {
      const jobId = await jobQueue.enqueue(type, payload || {}, {
        videoId,
        rootKey,
        relativePath,
        priority: priority ?? 5,
        maxAttempts: maxAttempts ?? 3,
      });

      res.status(202).json({
        success: true,
        jobId,
        message: 'Job enqueued successfully',
      });
    } catch (error: any) {
      logger.error('[JobsAPI] Failed to enqueue job:', error);
      res.status(500).json({
        error: 'Failed to enqueue job',
        message: error.message,
      });
    }
  }),
);

/**
 * GET /api/jobs/:jobId
 *
 * Get job status by ID
 */
router.get(
  '/:jobId',
  asyncHandler(async (req: Request, res: Response) => {
    const { jobId } = req.params;

    // @ts-ignore - jobQueue injected by server
    const jobQueue = req.app.locals.jobQueue;

    if (!jobQueue) {
      return res.status(503).json({ error: 'Job queue unavailable' });
    }

    const job = await jobQueue.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  }),
);

/**
 * GET /api/jobs
 *
 * List jobs with optional filters
 * Query params:
 *   - status: comma-separated list of statuses (pending,processing,completed,failed)
 *   - limit: max number of jobs to return (default: 100, max: 1000)
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { status, limit } = req.query;

    // @ts-ignore - jobQueue injected by server
    const jobQueue = req.app.locals.jobQueue;

    if (!jobQueue) {
      return res.status(503).json({ error: 'Job queue unavailable' });
    }

    // Parse status filter
    let statusFilter: string[] = ['pending', 'processing', 'completed', 'failed'];
    if (status && typeof status === 'string') {
      statusFilter = status.split(',').filter((s) => s.trim());
    }

    // Parse limit
    let limitNum = 100;
    if (limit && typeof limit === 'string') {
      const parsed = parseInt(limit, 10);
      if (parsed > 0 && parsed <= 1000) {
        limitNum = parsed;
      }
    }

    const jobs = await jobQueue.getJobsByStatus(statusFilter, limitNum);

    res.json({
      count: jobs.length,
      jobs,
    });
  }),
);

/**
 * GET /api/jobs/stats
 *
 * Get job queue statistics
 */
router.get(
  '/stats/summary',
  asyncHandler(async (req: Request, res: Response) => {
    // @ts-ignore - jobQueue injected by server
    const jobQueue = req.app.locals.jobQueue;

    if (!jobQueue) {
      return res.status(503).json({ error: 'Job queue unavailable' });
    }

    const stats = await jobQueue.getStats();

    res.json(stats);
  }),
);

/**
 * POST /api/jobs/cleanup
 *
 * Cleanup completed jobs older than specified days
 * Body:
 *   - olderThanDays: number of days (default: 7)
 */
router.post(
  '/cleanup',
  asyncHandler(async (req: Request, res: Response) => {
    const { olderThanDays = 7 } = req.body;

    // @ts-ignore - jobQueue injected by server
    const jobQueue = req.app.locals.jobQueue;

    if (!jobQueue) {
      return res.status(503).json({ error: 'Job queue unavailable' });
    }

    await jobQueue.clearCompleted(olderThanDays);

    res.json({
      success: true,
      message: `Cleared completed jobs older than ${olderThanDays} days`,
    });
  }),
);

/**
 * DELETE /api/jobs/:jobId
 *
 * Cancel/delete a job (only if pending or failed)
 */
router.delete(
  '/:jobId',
  asyncHandler(async (req: Request, res: Response) => {
    const { jobId } = req.params;

    // @ts-ignore - db and jobQueue injected by server
    const db = req.app.locals.db;
    const jobQueue = req.app.locals.jobQueue;

    if (!jobQueue || !db) {
      return res.status(503).json({ error: 'Job queue or database unavailable' });
    }

    const job = await jobQueue.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Only allow deletion of pending or failed jobs
    if (job.status === 'processing') {
      return res.status(400).json({
        error: 'Cannot delete job in processing state',
        message: 'Wait for job to complete or fail before deleting',
      });
    }

    if (job.status === 'completed') {
      return res.status(400).json({
        error: 'Cannot delete completed job',
        message: 'Use POST /api/jobs/cleanup to remove old completed jobs',
      });
    }

    // Delete from database
    const { processingJobs } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    await db.delete(processingJobs).where(eq(processingJobs.id, jobId));

    res.json({
      success: true,
      message: 'Job deleted',
    });
  }),
);

export default router;
