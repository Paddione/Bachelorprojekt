import { describe, it, expect, vi } from 'vitest';
import { JobQueue } from './job-queue';

describe('JobQueue', () => {
    it('should process jobs in order with concurrency limit', async () => {
        const queue = new JobQueue(2);
        const results: number[] = [];

        queue.registerHandler('test', async (data: { value: number, delay: number }) => {
            await new Promise(resolve => setTimeout(resolve, data.delay));
            results.push(data.value);
            return data.value * 2;
        });

        const job1 = queue.add('test', { value: 1, delay: 50 });
        const job2 = queue.add('test', { value: 2, delay: 10 });
        const job3 = queue.add('test', { value: 3, delay: 10 });

        // Wait for all jobs to complete
        await new Promise<void>(resolve => {
            let completed = 0;
            queue.on('jobCompleted', () => {
                completed++;
                if (completed === 3) resolve();
            });
        });

        // With concurrency 2:
        // Job 1 starts (50ms)
        // Job 2 starts (10ms) -> finishes first -> results: [2]
        // Job 3 starts (10ms) -> finishes second -> results: [2, 3]
        // Job 1 finishes -> results: [2, 3, 1]

        expect(results).toEqual([2, 3, 1]);
        expect(job1.status).toBe('completed');
        expect(job2.status).toBe('completed');
        expect(job3.status).toBe('completed');
    });
});
