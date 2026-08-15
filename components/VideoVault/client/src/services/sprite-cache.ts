export interface SpriteMeta {
  cols: number;
  frameWidth: number;
  frameHeight: number;
}

interface SpriteEntry {
  meta: SpriteMeta;
  dataUrl?: string;
  updatedAt: number;
  priority: number; // Higher priority = recently hovered
}

const CACHE = new Map<string, SpriteEntry>();
const LS_PREFIX = 'vv.spriteMeta.';
const MAX_ENTRIES = 200; // Reduced from 500 - sprites are larger
const MEMORY_THRESHOLD_MB = 250; // Same as thumbnail cache

export const SpriteCache = {
  get(videoId: string): { meta: SpriteMeta; dataUrl?: string } | null {
    let entry = CACHE.get(videoId);
    if (!entry && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(LS_PREFIX + videoId);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            meta: SpriteMeta;
            dataUrl?: string;
            updatedAt?: number;
          };
          if (parsed?.meta && typeof parsed.meta.cols === 'number') {
            entry = {
              meta: parsed.meta,
              dataUrl: parsed.dataUrl,
              updatedAt: parsed.updatedAt || Date.now(),
              priority: 1,
            };
            CACHE.set(videoId, entry);
          }
        }
      } catch {}
    }
    // Boost priority on access
    if (entry) {
      entry.priority = Math.min(10, entry.priority + 1);
      entry.updatedAt = Date.now();
    }
    return entry ? { meta: entry.meta, dataUrl: entry.dataUrl } : null;
  },
  set(videoId: string, meta: SpriteMeta, dataUrl?: string, priority = 1): void {
    // Check memory pressure before adding
    if (this.isMemoryPressureHigh() && CACHE.size >= MAX_ENTRIES * 0.8) {
      this.evict();
    }

    const stored: SpriteEntry = { meta, dataUrl, updatedAt: Date.now(), priority };
    CACHE.set(videoId, stored);
    // Persist lightweight metadata across sessions
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          LS_PREFIX + videoId,
          JSON.stringify({ meta, dataUrl: undefined, updatedAt: stored.updatedAt }),
        );
      } catch {}
    }
    if (CACHE.size > MAX_ENTRIES) this.evict();
  },
  evict(): void {
    // Priority-based eviction: remove lowest priority entries first
    const items = Array.from(CACHE.entries()).sort((a, b) => {
      // Sort by priority (lower first), then by timestamp (older first)
      if (a[1].priority !== b[1].priority) {
        return a[1].priority - b[1].priority;
      }
      return a[1].updatedAt - b[1].updatedAt;
    });
    const removeCount = Math.max(1, Math.floor(items.length * 0.2)); // Remove 20%
    for (let i = 0; i < removeCount; i++) {
      CACHE.delete(items[i][0]);
    }
  },
  clear(): void {
    CACHE.clear();
  },
  isMemoryPressureHigh(): boolean {
    if (typeof performance === 'undefined' || !('memory' in performance)) {
      return false;
    }
    const memory = (performance as any).memory;
    if (!memory || typeof memory.usedJSHeapSize !== 'number') {
      return false;
    }
    const usedMB = memory.usedJSHeapSize / (1024 * 1024);
    return usedMB > MEMORY_THRESHOLD_MB;
  },
};
