import { EventEmitter } from 'events';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { processingJobs, type DBProcessingJob, type InsertDBProcessingJob } from '@shared/schema';
import { logger } from './logger';

export interface JobHandler<T = any> {
  (data: T, job: JobContext): Promise<any>;
}

export interface JobContext {
  id: string;
  type: string;
  videoId?: string | null;
  rootKey?: string | null;
  relativePath?: string | null;
  priority: number;
  payload: any;
  attempts: number;
  maxAttempts: number;
}

export interface EnqueueOptions {
  priority?: number;
  videoId?: string;
  rootKey?: string;
  relativePath?: string;
  maxAttempts?: number;
}

/**
 * Enhanced Job Queue with Postgres persistence
 *
 * Features:
 * - Persistent storage (survives server restarts)
 * - Priority-based processing (1=highest, 10=lowest)
 * - Retry logic with configurable max attempts
 * - Concurrent processing with adjustable worker count
 * - Event emitter for monitoring (jobCompleted, jobFailed, jobRetrying)
 * - Auto-cleanup of old completed jobs
 */
export class EnhancedJobQueue extends EventEmitter {
  private handlers: Map<string, JobHandler> = new Map();
  private concurrency: number;
  private activeJobs: Map<string, Promise<void>> = new Map();
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private db: any; // Drizzle db instance

  constructor(db: any, concurrency: number = 4) {
    super();
    this.db = db;
    this.concurrency = concurrency;
  }

  /**
   * Register a handler for a job type
   */
  registerHandler<T>(type: string, handler: JobHandler<T>) {
    this.handlers.set(type, handler);
    logger.info(`[JobQueue] Registered handler: ${type}`);
  }

  /**
   * Enqueue a new job
   * Returns job ID for status polling
   */
  async enqueue(
    type: string,
    payload: any,
    options: EnqueueOptions = {},
  ): Promise<string> {
    if (!this.db) {
      throw new Error('Database not available');
    }

    const jobData: InsertDBProcessingJob = {
      type,
      videoId: options.videoId ?? null,
      rootKey: options.rootKey ?? null,
      relativePath: options.relativePath ?? null,
      priority: options.priority ?? 5,
      payload: payload || {},
      status: 'pending',
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
    };

    const [job] = await this.db.insert(processingJobs).values(jobData).returning();

    logger.info(`[JobQueue] Enqueued job: ${job.id} (${type}, priority=${job.priority})`);
    this.emit('jobEnqueued', job);

    // Trigger processing if queue is running
    if (this.isRunning) {
      setImmediate(() => this.process());
    }

    return job.id;
  }

  /**
   * Start the job queue processing
   */
  async start() {
    if (this.isRunning) {
      logger.warn('[JobQueue] Already running');
      return;
    }

    this.isRunning = true;
    logger.info('[JobQueue] Started');

    // Process existing jobs immediately
    await this.process();

    // Poll for new jobs every 5 seconds
    this.pollInterval = setInterval(() => this.process(), 5000);

    // Reset stale "processing" jobs on startup (server crash recovery)
    await this.resetStaleJobs();
  }

  /**
   * Stop the job queue
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Wait for active jobs to complete
    logger.info(`[JobQueue] Stopping... (${this.activeJobs.size} active jobs)`);
    await Promise.allSettled(Array.from(this.activeJobs.values()));
    logger.info('[JobQueue] Stopped');
  }

  /**
   * Process pending jobs from the queue
   */
  private async process() {
    if (!this.isRunning || !this.db) {
      return;
    }

    // Calculate available worker slots
    const availableSlots = this.concurrency - this.activeJobs.size;
    if (availableSlots <= 0) {
      return;
    }

    try {
      // Fetch pending jobs ordered by priority and creation time
      const pendingJobs = await this.db
        .select()
        .from(processingJobs)
        .where(
          and(
            eq(processingJobs.status, 'pending'),
            sql`${processingJobs.attempts} < ${processingJobs.maxAttempts}`,
          ),
        )
        .orderBy(processingJobs.priority, processingJobs.createdAt)
        .limit(availableSlots);

      for (const job of pendingJobs) {
        this.executeJob(job);
      }
    } catch (error: any) {
      logger.error('[JobQueue] Error fetching jobs:', error);
    }
  }

  /**
   * Execute a single job
   */
  private async executeJob(job: DBProcessingJob) {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      logger.error(`[JobQueue] No handler for job type: ${job.type}`, { jobId: job.id });
      await this.markFailed(job.id, 'No handler registered for job type');
      return;
    }

    // Mark as processing
    try {
      await this.db
        .update(processingJobs)
        .set({
          status: 'processing',
          startedAt: new Date(),
          attempts: job.attempts + 1,
        })
        .where(eq(processingJobs.id, job.id));
    } catch (error: any) {
      logger.error(`[JobQueue] Failed to mark job as processing:`, error);
      return;
    }

    const promise = (async () => {
      try {
        logger.info(`[JobQueue] Processing job: ${job.id} (${job.type}, attempt ${job.attempts + 1}/${job.maxAttempts})`);

        const context: JobContext = {
          id: job.id,
          type: job.type,
          videoId: job.videoId,
          rootKey: job.rootKey,
          relativePath: job.relativePath,
          priority: Number(job.priority),
          payload: job.payload,
          attempts: Number(job.attempts) + 1,
          maxAttempts: Number(job.maxAttempts),
        };

        const result = await handler(job.payload, context);
        await this.markCompleted(job.id, result);
        this.emit('jobCompleted', job, result);
        logger.info(`[JobQueue] Completed job: ${job.id} (${job.type})`);
      } catch (error: any) {
        logger.error(`[JobQueue] Job failed: ${job.id} (${job.type})`, {
          error: error.message,
          stack: error.stack,
        });

        const newAttempts = Number(job.attempts) + 1;
        if (newAttempts >= Number(job.maxAttempts)) {
          await this.markFailed(job.id, error.message);
          this.emit('jobFailed', job, error);
        } else {
          // Retry: reset to pending
          await this.db
            .update(processingJobs)
            .set({ status: 'pending' })
            .where(eq(processingJobs.id, job.id));
          this.emit('jobRetrying', job, error);
          logger.info(`[JobQueue] Retrying job: ${job.id} (attempt ${newAttempts}/${job.maxAttempts})`);
        }
      } finally {
        this.activeJobs.delete(job.id);
        // Trigger next batch
        setImmediate(() => this.process());
      }
    })();

    this.activeJobs.set(job.id, promise);
  }

  /**
   * Mark job as completed
   */
  private async markCompleted(jobId: string, result: any) {
    if (!this.db) return;

    await this.db
      .update(processingJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        payload: result ? { ...result } : null, // Store result in payload
      })
      .where(eq(processingJobs.id, jobId));
  }

  /**
   * Mark job as failed
   */
  private async markFailed(jobId: string, errorMessage: string) {
    if (!this.db) return;

    await this.db
      .update(processingJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage,
      })
      .where(eq(processingJobs.id, jobId));
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<DBProcessingJob | null> {
    if (!this.db) return null;

    const [job] = await this.db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.id, jobId))
      .limit(1);

    return job || null;
  }

  /**
   * Get jobs by status
   */
  async getJobsByStatus(status: string[], limit: number = 100): Promise<DBProcessingJob[]> {
    if (!this.db) return [];

    return await this.db
      .select()
      .from(processingJobs)
      .where(inArray(processingJobs.status, status))
      .orderBy(processingJobs.createdAt)
      .limit(limit);
  }

  /**
   * Clear completed jobs older than specified days
   */
  async clearCompleted(olderThanDays: number = 7) {
    if (!this.db) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await this.db
      .delete(processingJobs)
      .where(
        and(
          eq(processingJobs.status, 'completed'),
          sql`${processingJobs.completedAt} < ${cutoff}`,
        ),
      );

    logger.info(`[JobQueue] Cleared ${result.rowCount || 0} completed jobs older than ${olderThanDays} days`);
  }

  /**
   * Reset stale "processing" jobs to "pending" on server startup
   * (Handles crash recovery)
   */
  private async resetStaleJobs() {
    if (!this.db) return;

    const result = await this.db
      .update(processingJobs)
      .set({ status: 'pending', startedAt: null })
      .where(eq(processingJobs.status, 'processing'));

    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info(`[JobQueue] Reset ${count} stale processing jobs to pending`);
    }
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    if (!this.db) {
      return {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        active: this.activeJobs.size,
      };
    }

    const stats = await this.db
      .select({
        status: processingJobs.status,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(processingJobs)
      .groupBy(processingJobs.status);

    const result: Record<string, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      active: this.activeJobs.size,
    };

    stats.forEach((row: any) => {
      result[row.status] = Number(row.count);
    });

    return result;
  }
}

// Export singleton instance (will be initialized in server/index.ts with db)
export let jobQueue: EnhancedJobQueue;

export function initializeJobQueue(db: any, concurrency?: number) {
  jobQueue = new EnhancedJobQueue(db, concurrency);
  return jobQueue;
}
