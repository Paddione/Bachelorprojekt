/**
 * Centralized LRU cache for thumbnail images with memory-aware eviction.
 * Manages thumbnail lifecycle and prevents memory bloat.
 */

interface CacheEntry {
  dataUrl: string;
  timestamp: number;
  priority: number; // Higher = more important to keep
  size: number; // Estimated size in bytes
}

interface PreloadRequest {
  videoId: string;
  priority: number;
}

const DEFAULT_MAX_ENTRIES = 200;
const MEMORY_THRESHOLD_MB = 250; // Start evicting aggressively above this
const PRELOAD_DELAY_MS = 100; // Delay before starting preload

export class ThumbnailCache {
  private cache = new Map<string, CacheEntry>();
  private preloadQueue: PreloadRequest[] = [];
  private preloadTimer: number | null = null;
  private maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /**
   * Get a thumbnail from cache
   */
  get(videoId: string): string | null {
    const entry = this.cache.get(videoId);
    if (entry) {
      // Update timestamp and boost priority on access
      entry.timestamp = Date.now();
      entry.priority = Math.min(10, entry.priority + 1);
      return entry.dataUrl;
    }
    return null;
  }

  /**
   * Store a thumbnail in cache
   */
  set(videoId: string, dataUrl: string, priority = 1): void {
    // Estimate size from data URL length
    const size = dataUrl.length;

    const entry: CacheEntry = {
      dataUrl,
      timestamp: Date.now(),
      priority,
      size,
    };

    this.cache.set(videoId, entry);

    // Check if we need to evict
    this.maybeEvict();
  }

  /**
   * Remove a thumbnail from cache and revoke blob URL if applicable
   */
  remove(videoId: string): void {
    const entry = this.cache.get(videoId);
    if (entry) {
      // Revoke blob URL if it's a blob
      if (entry.dataUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(entry.dataUrl);
        } catch (e) {
          // Ignore errors
        }
      }
      this.cache.delete(videoId);
    }
  }

  /**
   * Check if a thumbnail exists in cache
   */
  has(videoId: string): boolean {
    return this.cache.has(videoId);
  }

  /**
   * Queue a thumbnail for preloading
   */
  queuePreload(videoId: string, priority = 1): void {
    // Don't queue if already in cache
    if (this.has(videoId)) {
      return;
    }

    // Add to queue if not already there
    const existing = this.preloadQueue.find((req) => req.videoId === videoId);
    if (!existing) {
      this.preloadQueue.push({ videoId, priority });
      this.schedulePreload();
    }
  }

  /**
   * Cancel preload for a video
   */
  cancelPreload(videoId: string): void {
    this.preloadQueue = this.preloadQueue.filter((req) => req.videoId !== videoId);
  }

  /**
   * Clear all preload requests
   */
  clearPreloadQueue(): void {
    this.preloadQueue = [];
    if (this.preloadTimer !== null) {
      window.clearTimeout(this.preloadTimer);
      this.preloadTimer = null;
    }
  }

  /**
   * Get current cache size
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Get estimated memory usage in MB
   */
  getMemoryUsageMB(): number {
    let totalSize = 0;
    for (const entry of Array.from(this.cache.values())) {
      totalSize += entry.size;
    }
    return totalSize / (1024 * 1024);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    // Revoke all blob URLs
    for (const [videoId] of Array.from(this.cache.entries())) {
      this.remove(videoId);
    }
    this.cache.clear();
    this.clearPreloadQueue();
  }

  /**
   * Schedule preload processing
   */
  private schedulePreload(): void {
    if (this.preloadTimer !== null) {
      return;
    }

    this.preloadTimer = window.setTimeout(() => {
      this.preloadTimer = null;
      this.processPreloadQueue();
    }, PRELOAD_DELAY_MS);
  }

  /**
   * Process preload queue (to be implemented by consumer)
   * This is a hook for the application to actually load thumbnails
   */
  private processPreloadQueue(): void {
    // Sort by priority (higher first)
    this.preloadQueue.sort((a, b) => b.priority - a.priority);

    // Take top items (limit to avoid overwhelming)
    const toPreload = this.preloadQueue.splice(0, 5);

    // Emit event for consumers to handle
    if (toPreload.length > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('thumbnail-preload-requested', {
          detail: { requests: toPreload },
        }),
      );
    }
  }

  /**
   * Evict entries if cache is too large or memory pressure is high
   */
  private maybeEvict(): void {
    const shouldEvict = this.cache.size > this.maxEntries || this.isMemoryPressureHigh();

    if (!shouldEvict) {
      return;
    }

    // Calculate how many to remove
    const targetSize = Math.floor(this.maxEntries * 0.8); // Remove 20% when evicting
    const toRemove = Math.max(1, this.cache.size - targetSize);

    // Sort by priority (lower first) and timestamp (older first)
    const entries = Array.from(this.cache.entries()).sort((a, b) => {
      const [, entryA] = a;
      const [, entryB] = b;

      // Priority is primary sort
      if (entryA.priority !== entryB.priority) {
        return entryA.priority - entryB.priority;
      }

      // Timestamp is secondary sort (older first)
      return entryA.timestamp - entryB.timestamp;
    });

    // Remove lowest priority/oldest entries
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const [videoId] = entries[i];
      this.remove(videoId);
    }
  }

  /**
   * Check if memory pressure is high
   */
  private isMemoryPressureHigh(): boolean {
    if (typeof performance === 'undefined' || !('memory' in performance)) {
      return false;
    }

    const memory = (performance as any).memory;
    if (!memory || typeof memory.usedJSHeapSize !== 'number') {
      return false;
    }

    const usedMB = memory.usedJSHeapSize / (1024 * 1024);
    return usedMB > MEMORY_THRESHOLD_MB;
  }
}

// Singleton instance
let instance: ThumbnailCache | null = null;

export function getThumbnailCache(): ThumbnailCache {
  if (!instance) {
    instance = new ThumbnailCache();
  }
  return instance;
}

export function resetThumbnailCache(): void {
  if (instance) {
    instance.clear();
  }
  instance = null;
}
