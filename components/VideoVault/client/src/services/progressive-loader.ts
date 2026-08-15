import * as React from 'react';

/**
 * Progressive Data Loader
 *
 * Loads large datasets in chunks to avoid blocking the main thread.
 * Uses requestIdleCallback for non-blocking processing.
 */

export interface ProgressiveLoadOptions<T = unknown> {
  chunkSize?: number;
  onProgress?: (loaded: number, total: number) => void;
  onChunkLoaded?: (chunk: T[], totalLoaded: number) => void;
}

export class ProgressiveLoader {
  /**
   * Load data in chunks using requestIdleCallback to avoid blocking the main thread
   */
  static async loadInChunks<T>(data: T[], options: ProgressiveLoadOptions<T> = {}): Promise<T[]> {
    const { chunkSize = 500, onProgress, onChunkLoaded } = options;

    if (data.length === 0) {
      return data;
    }

    // If dataset is small, return immediately
    if (data.length <= chunkSize) {
      onProgress?.(data.length, data.length);
      return data;
    }

    const chunks: T[][] = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }

    const result: T[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Process chunk
      await new Promise<void>((resolve) => {
        const processChunk = () => {
          result.push(...chunk);
          const loaded = result.length;

          onProgress?.(loaded, data.length);
          onChunkLoaded?.(chunk, loaded);

          resolve();
        };

        // Use requestIdleCallback if available, otherwise setTimeout
        if ('requestIdleCallback' in window) {
          requestIdleCallback(processChunk, { timeout: 50 });
        } else {
          setTimeout(processChunk, 0);
        }
      });
    }

    return result;
  }

  /**
   * Process items in batches with a callback for each batch
   */
  static async processBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R> | R,
    options: ProgressiveLoadOptions = {},
  ): Promise<R[]> {
    const { chunkSize = 500, onProgress } = options;

    if (items.length === 0) {
      return [];
    }

    const results: R[] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      const batch = items.slice(i, i + chunkSize);

      // Process batch in idle time
      const batchResult = await new Promise<R>((resolve) => {
        const process = async () => {
          const result = await processor(batch);
          onProgress?.(Math.min(i + chunkSize, items.length), items.length);
          resolve(result);
        };

        if ('requestIdleCallback' in window) {
          requestIdleCallback(
            () => {
              void process();
            },
            { timeout: 50 },
          );
        } else {
          setTimeout(() => {
            void process();
          }, 0);
        }
      });

      results.push(batchResult);
    }

    return results;
  }

  /**
   * Defer a heavy operation using startTransition (React 18+)
   */
  static deferOperation<T>(operation: () => T): Promise<T> {
    return new Promise((resolve) => {
      // Check if React 18's startTransition is available
      if (typeof window !== 'undefined' && typeof React.startTransition === 'function') {
        React.startTransition(() => resolve(operation()));
        return;
      }

      // Fallback to requestIdleCallback
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => resolve(operation()), { timeout: 100 });
      } else {
        setTimeout(() => resolve(operation()), 0);
      }
    });
  }
}
