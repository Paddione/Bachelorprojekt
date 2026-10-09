export class MemoryCache {
    cache = new Map();
    cleanupTimer;
    config;
    stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
    };
    constructor(config) {
        this.config = config;
        this.startCleanupTimer();
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        if (this.isExpired(entry)) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }
        // Update access statistics
        entry.accessCount++;
        entry.lastAccessed = Date.now();
        // Adaptive TTL: extend TTL for frequently accessed items
        // Cap at 1 hour maximum to prevent unbounded growth
        const MAX_TTL = 3600000; // 1 hour
        if (entry.accessCount > 3 && entry.priority >= 2) {
            entry.ttl = Math.min(entry.ttl * 1.2, MAX_TTL);
        }
        this.stats.hits++;
        return entry.data;
    }
    // Get data even if expired (stale cache)
    getStale(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        return entry.data;
    }
    set(key, data, ttl, priority = 2) {
        const now = Date.now();
        const entry = {
            data,
            timestamp: now,
            ttl: ttl || 300000, // 5 minutes default
            accessCount: 0,
            lastAccessed: now,
            priority: priority,
            size: this.estimateSize(data),
        };
        this.cache.set(key, entry);
        this.enforceMaxSizeWithPriority();
    }
    delete(key) {
        return this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    has(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }
        if (this.isExpired(entry)) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
    size() {
        return this.cache.size;
    }
    keys() {
        return this.cache.keys();
    }
    cleanup() {
        const now = Date.now();
        const keysToDelete = [];
        for (const [key, entry] of this.cache.entries()) {
            if (this.isExpired(entry, now)) {
                keysToDelete.push(key);
            }
        }
        for (const key of keysToDelete) {
            this.cache.delete(key);
        }
    }
    // Cleanup with stale data retention for fallback scenarios
    cleanupWithStaleRetention() {
        const now = Date.now();
        const keysToDelete = [];
        const staleThreshold = 24 * 60 * 60 * 1000; // Keep stale data for 24 hours
        for (const [key, entry] of this.cache.entries()) {
            // Only delete if data is older than TTL + stale threshold
            if (now - entry.timestamp > entry.ttl + staleThreshold) {
                keysToDelete.push(key);
            }
        }
        for (const key of keysToDelete) {
            this.cache.delete(key);
        }
    }
    // Get comprehensive cache statistics
    getStats() {
        const now = Date.now();
        const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
            key,
            age: now - entry.timestamp,
            accessCount: entry.accessCount,
            priority: entry.priority,
            isExpired: this.isExpired(entry, now),
        }));
        const totalOperations = this.stats.hits + this.stats.misses;
        const totalAge = entries.reduce((sum, entry) => sum + entry.age, 0);
        const totalMemory = Array.from(this.cache.values()).reduce((sum, entry) => sum + (entry.size || 0), 0);
        return {
            size: this.cache.size,
            hitRate: totalOperations > 0 ? this.stats.hits / totalOperations : 0,
            missRate: totalOperations > 0 ? this.stats.misses / totalOperations : 0,
            evictionRate: this.cache.size > 0 ? this.stats.evictions / this.cache.size : 0,
            averageAge: entries.length > 0 ? totalAge / entries.length : 0,
            memoryUsage: totalMemory,
            entries,
        };
    }
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.clear();
    }
    isExpired(entry, now = Date.now()) {
        return now - entry.timestamp > entry.ttl;
    }
    enforceMaxSizeWithPriority() {
        if (this.cache.size <= this.config.maxSize) {
            return;
        }
        const entries = Array.from(this.cache.entries());
        // Priority-based eviction algorithm
        // Score = priority * access_frequency + age_factor
        entries.sort(([keyA, entryA], [keyB, entryB]) => {
            const now = Date.now();
            const scoreA = this.calculateEvictionScore(entryA, now);
            const scoreB = this.calculateEvictionScore(entryB, now);
            return scoreA - scoreB; // Lower score = evict first
        });
        const toDelete = entries.slice(0, entries.length - this.config.maxSize);
        for (const [key] of toDelete) {
            this.cache.delete(key);
            this.stats.evictions++;
        }
    }
    calculateEvictionScore(entry, now) {
        const age = now - entry.timestamp;
        const timeSinceAccess = now - entry.lastAccessed;
        // Higher priority = higher score (less likely to be evicted)
        const priorityScore = entry.priority * 10;
        // More access = higher score (less likely to be evicted)
        const accessScore = Math.log(entry.accessCount + 1) * 5;
        // Recent access = higher score (less likely to be evicted)
        const freshnessScore = 1000000 / (timeSinceAccess + 1000);
        // Age penalty (older = lower score)
        const agePenalty = age / 100000;
        return priorityScore + accessScore + freshnessScore - agePenalty;
    }
    estimateSize(data) {
        try {
            return JSON.stringify(data).length * 2; // Rough estimate (2 bytes per char)
        }
        catch {
            return 1000; // Default size if can't serialize
        }
    }
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            // Use stale retention cleanup for better offline capabilities
            this.cleanupWithStaleRetention();
        }, this.config.cleanupInterval);
    }
}
//# sourceMappingURL=LocalCache.js.map