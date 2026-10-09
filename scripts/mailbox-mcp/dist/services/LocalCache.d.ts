import type { CacheConfig, CachePriority, CacheStats, LocalCache } from "../types/cache.types.js";
export declare class MemoryCache implements LocalCache {
    private cache;
    private cleanupTimer?;
    private config;
    private stats;
    constructor(config: CacheConfig);
    get<T>(key: string): T | null;
    getStale<T>(key: string): T | null;
    set<T>(key: string, data: T, ttl?: number, priority?: CachePriority): void;
    delete(key: string): boolean;
    clear(): void;
    has(key: string): boolean;
    size(): number;
    keys(): IterableIterator<string>;
    cleanup(): void;
    cleanupWithStaleRetention(): void;
    getStats(): CacheStats;
    destroy(): void;
    private isExpired;
    private enforceMaxSizeWithPriority;
    private calculateEvictionScore;
    private estimateSize;
    private startCleanupTimer;
}
