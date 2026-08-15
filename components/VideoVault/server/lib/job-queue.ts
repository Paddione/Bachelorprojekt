import { EventEmitter } from 'events';
import { logger } from './logger';

export interface Job<T = any> {
    id: string;
    type: string;
    data: T;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: any;
    error?: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
}

export class JobQueue extends EventEmitter {
    private queue: Job[] = [];
    private processing: Map<string, Job> = new Map();
    private concurrency: number;
    private isRunning: boolean = false;

    constructor(concurrency: number = 2) {
        super();
        this.concurrency = concurrency;
    }

    add<T>(type: string, data: T): Job<T> {
        const job: Job<T> = {
            id: Math.random().toString(36).substring(2, 15),
            type,
            data,
            status: 'pending',
            createdAt: Date.now(),
        };
        this.queue.push(job);
        this.emit('jobAdded', job);
        this.process();
        return job;
    }

    getJob(id: string): Job | undefined {
        return this.queue.find((j) => j.id === id) || this.processing.get(id);
    }

    getStats() {
        return {
            pending: this.queue.length,
            processing: this.processing.size,
            concurrency: this.concurrency,
        };
    }

    private async process() {
        if (this.isRunning) return;
        this.isRunning = true;

        while (this.processing.size < this.concurrency && this.queue.length > 0) {
            const job = this.queue.shift();
            if (!job) break;

            this.processing.set(job.id, job);
            job.status = 'processing';
            job.startedAt = Date.now();
            this.emit('jobStarted', job);

            // Execute job asynchronously
            this.executeJob(job).finally(() => {
                this.processing.delete(job.id);
                this.process(); // Trigger next
            });
        }

        this.isRunning = false;
    }

    private async executeJob(job: Job) {
        try {
            const handler = this.handlers.get(job.type);
            if (!handler) {
                throw new Error(`No handler for job type ${job.type}`);
            }
            const result = await handler(job.data);
            job.status = 'completed';
            job.result = result;
            job.completedAt = Date.now();
            this.emit('jobCompleted', job);
            logger.info(`Job ${job.id} (${job.type}) completed`);
        } catch (error: any) {
            job.status = 'failed';
            job.error = error.message;
            job.completedAt = Date.now();
            this.emit('jobFailed', job);
            logger.error(`Job ${job.id} (${job.type}) failed: ${error.message}`);
        }
    }

    private handlers: Map<string, (data: any) => Promise<any>> = new Map();

    registerHandler(type: string, handler: (data: any) => Promise<any>) {
        this.handlers.set(type, handler);
    }
}

// Increase concurrency for thumbnail generation (parallel FFmpeg processes)
export const jobQueue = new JobQueue(4);
