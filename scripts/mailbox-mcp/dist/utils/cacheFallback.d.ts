import type { LoggerLike } from "../services/Logger.js";
import type { LocalCache } from "../types/cache.types.js";
/**
 * Options for cache fallback operations
 */
export interface CacheFallbackOptions<T> {
    /**
     * Unique cache key for storing/retrieving data
     */
    cacheKey: string;
    /**
     * Cache instance to use
     */
    cache: LocalCache;
    /**
     * Function to fetch fresh data
     */
    fetch: () => Promise<T>;
    /**
     * Default value to return if all fallbacks fail (connection errors only)
     */
    defaultValue: T;
    /**
     * Logger instance for logging warnings and errors
     */
    logger: LoggerLike;
    /**
     * Operation name for logging context
     */
    operation: string;
    /**
     * Service name for logging context
     */
    service: string;
    /**
     * Time-to-live for cached data in milliseconds
     */
    ttl?: number;
    /**
     * Additional context for logging (optional)
     */
    logContext?: Record<string, unknown>;
}
/**
 * Executes an operation with cache-first strategy and fallback handling.
 *
 * Flow:
 * 1. Check cache for fresh data → return if found
 * 2. Try to fetch fresh data → cache and return if successful
 * 3. On error:
 *    - If connection error:
 *      a. Try stale cache → return if found
 *      b. Return default value if no stale cache
 *    - If other error: throw
 *
 * @param options - Configuration for the cached operation
 * @returns The cached, fresh, stale, or default data
 */
export declare function withCacheFallback<T>(options: CacheFallbackOptions<T>): Promise<T>;
