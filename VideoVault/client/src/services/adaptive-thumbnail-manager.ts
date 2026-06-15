import type { VideoThumbnail, VideoMetadata } from '../types/video';
import { VideoThumbnailService } from './video-thumbnail';
import {
  EnhancedThumbnailService,
  ThumbnailGenerationOptions,
  ThumbnailResult,
} from './enhanced-thumbnail-service';
import {
  WebCodecsThumbnailService,
  WebCodecsThumbnailOptions,
} from './webcodecs-thumbnail-service';

export interface AdaptiveOptions {
  quality: 'low' | 'medium' | 'high' | 'auto';
  speed: 'fast' | 'balanced' | 'quality' | 'auto';
  progressive: boolean;
  cacheStrategy: 'memory' | 'indexeddb' | 'none';
  maxCacheSize: number; // in MB
  enablePerformanceLogging: boolean;
}

type AdaptiveThumbnailOptions = Partial<AdaptiveOptions> &
  Partial<Omit<ThumbnailGenerationOptions, 'quality'>>;

export interface PerformanceMetrics {
  method: 'basic' | 'enhanced' | 'webcodecs';
  duration: number;
  cacheHit: boolean;
  quality: number;
  fileSize: number;
  success: boolean;
  error?: string;
}

export interface ThumbnailCacheEntry {
  thumbnail: VideoThumbnail;
  metadata: VideoMetadata;
  timestamp: number;
  method: string;
  fileSize: number;
  fileLastModified: number;
}

export class AdaptiveThumbnailManager {
  private static cache = new Map<string, ThumbnailCacheEntry>();
  private static performanceHistory: PerformanceMetrics[] = [];
  private static readonly MAX_HISTORY_SIZE = 100;
  private static readonly DEFAULT_OPTIONS: AdaptiveOptions = {
    quality: 'auto',
    speed: 'auto',
    progressive: true,
    cacheStrategy: 'memory',
    maxCacheSize: 50, // 50 MB
    enablePerformanceLogging: true,
  };

  static async generateAdaptiveThumbnail(
    file: File,
    options: AdaptiveThumbnailOptions = {},
  ): Promise<ThumbnailResult & { performanceMetrics: PerformanceMetrics }> {
    const adaptiveOptions = { ...this.DEFAULT_OPTIONS, ...options };
    const startTime = performance.now();

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(file);
      const cached = await this.getCachedThumbnail(cacheKey, file, adaptiveOptions);

      if (cached) {
        const duration = performance.now() - startTime;
        const metrics: PerformanceMetrics = {
          method: cached.method as any,
          duration,
          cacheHit: true,
          quality: 1.0,
          fileSize: file.size,
          success: true,
        };

        if (adaptiveOptions.enablePerformanceLogging) {
          this.recordPerformance(metrics);
        }

        return {
          thumbnail: cached.thumbnail,
          metadata: cached.metadata,
          performanceMetrics: metrics,
        };
      }

      // Determine optimal method based on options and capabilities
      const method = this.determineOptimalMethod(file, adaptiveOptions);
      const thumbnailOptions = this.buildThumbnailOptions(method, adaptiveOptions);

      let result: ThumbnailResult;
      let methodUsed: 'basic' | 'enhanced' | 'webcodecs';

      switch (method) {
        case 'webcodecs':
          result = await WebCodecsThumbnailService.generateOptimalThumbnail(file, thumbnailOptions);
          methodUsed = 'webcodecs';
          break;
        case 'enhanced':
          result = await EnhancedThumbnailService.generateEnhancedThumbnail(file, thumbnailOptions);
          methodUsed = 'enhanced';
          break;
        case 'basic':
        default:
          const basicThumbnail = await VideoThumbnailService.generateThumbnail(file);
          result = {
            thumbnail: basicThumbnail,
            metadata: {
              duration: 0,
              width: 0,
              height: 0,
              bitrate: 0,
              codec: '',
              fps: 0,
              aspectRatio: '0',
            },
          };
          methodUsed = 'basic';
          break;
      }

      const duration = performance.now() - startTime;

      // Cache the result
      if (adaptiveOptions.cacheStrategy !== 'none') {
        await this.cacheThumbnail(cacheKey, result, methodUsed, file, adaptiveOptions);
      }

      // Record performance
      const metrics: PerformanceMetrics = {
        method: methodUsed,
        duration,
        cacheHit: false,
        quality: this.assessThumbnailQuality(result.thumbnail),
        fileSize: file.size,
        success: true,
      };

      if (adaptiveOptions.enablePerformanceLogging) {
        this.recordPerformance(metrics);
      }

      return { ...result, performanceMetrics: metrics };
    } catch (error) {
      const duration = performance.now() - startTime;
      const metrics: PerformanceMetrics = {
        method: 'basic',
        duration,
        cacheHit: false,
        quality: 0,
        fileSize: file.size,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      if (adaptiveOptions.enablePerformanceLogging) {
        this.recordPerformance(metrics);
      }

      // Generate fallback thumbnail
      try {
        const fallbackThumbnail = VideoThumbnailService.generatePlaceholderThumbnail(file.name);
        return {
          thumbnail: fallbackThumbnail,
          metadata: {
            duration: 0,
            width: 0,
            height: 0,
            bitrate: 0,
            codec: '',
            fps: 0,
            aspectRatio: '0',
          },
          performanceMetrics: metrics,
        };
      } catch (fallbackError) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const fallbackMsg =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(
          `Thumbnail generation failed: ${errorMsg}. Fallback also failed: ${fallbackMsg}`,
        );
      }
    }
  }

  private static determineOptimalMethod(
    file: File,
    options: AdaptiveOptions,
  ): 'basic' | 'enhanced' | 'webcodecs' {
    // Auto-detect based on file size, browser capabilities, and performance history
    if (options.speed !== 'auto' || options.quality !== 'auto') {
      return this.getMethodForSpeedQuality(options.speed, options.quality);
    }

    const fileSize = file.size;
    const capabilities = this.assessBrowserCapabilities();
    const recentPerformance = this.getRecentPerformanceMetrics();

    // For small files (< 10MB), prefer enhanced method
    if (fileSize < 10 * 1024 * 1024) {
      if (
        capabilities.webcodecs &&
        recentPerformance.webcodecs.averageDuration < recentPerformance.enhanced.averageDuration
      ) {
        return 'webcodecs';
      }
      return capabilities.enhanced ? 'enhanced' : 'basic';
    }

    // For medium files (10-100MB), choose based on performance history
    if (fileSize < 100 * 1024 * 1024) {
      if (capabilities.webcodecs && recentPerformance.webcodecs.successRate > 0.8) {
        return 'webcodecs';
      }
      if (capabilities.enhanced && recentPerformance.enhanced.successRate > 0.9) {
        return 'enhanced';
      }
      return 'basic';
    }

    // For large files (>100MB), prefer fastest reliable method
    if (recentPerformance.webcodecs.successRate > 0.7 && capabilities.webcodecs) {
      return 'webcodecs';
    }
    if (recentPerformance.enhanced.successRate > 0.8 && capabilities.enhanced) {
      return 'enhanced';
    }
    return 'basic';
  }

  private static getMethodForSpeedQuality(
    speed: AdaptiveOptions['speed'],
    quality: AdaptiveOptions['quality'],
  ): 'basic' | 'enhanced' | 'webcodecs' {
    if (speed === 'fast') {
      return 'basic';
    }
    if (speed === 'quality' && quality === 'high') {
      return WebCodecsThumbnailService.checkWebCodecsSupport().isSupported
        ? 'webcodecs'
        : 'enhanced';
    }
    return 'enhanced';
  }

  private static assessBrowserCapabilities(): {
    basic: boolean;
    enhanced: boolean;
    webcodecs: boolean;
  } {
    return {
      basic: true,
      enhanced: 'createImageBitmap' in window && 'OffscreenCanvas' in window,
      webcodecs: WebCodecsThumbnailService.checkWebCodecsSupport().isSupported,
    };
  }

  private static getRecentPerformanceMetrics(): {
    basic: { averageDuration: number; successRate: number };
    enhanced: { averageDuration: number; successRate: number };
    webcodecs: { averageDuration: number; successRate: number };
  } {
    const recentMetrics = this.performanceHistory.slice(-20); // Last 20 operations

    const getMetricsForMethod = (method: string) => {
      const methodMetrics = recentMetrics.filter((m) => m.method === method);
      if (methodMetrics.length === 0) {
        return { averageDuration: Infinity, successRate: 0 };
      }

      const averageDuration =
        methodMetrics.reduce((sum, m) => sum + m.duration, 0) / methodMetrics.length;
      const successRate = methodMetrics.filter((m) => m.success).length / methodMetrics.length;

      return { averageDuration, successRate };
    };

    return {
      basic: getMetricsForMethod('basic'),
      enhanced: getMetricsForMethod('enhanced'),
      webcodecs: getMetricsForMethod('webcodecs'),
    };
  }

  private static buildThumbnailOptions(
    method: 'basic' | 'enhanced' | 'webcodecs',
    options: AdaptiveOptions,
  ): ThumbnailGenerationOptions & WebCodecsThumbnailOptions {
    const baseOptions: ThumbnailGenerationOptions = {};

    switch (options.quality) {
      case 'low':
        baseOptions.quality = 0.6;
        baseOptions.targetWidth = 160;
        break;
      case 'medium':
        baseOptions.quality = 0.8;
        baseOptions.targetWidth = 320;
        break;
      case 'high':
        baseOptions.quality = 0.95;
        baseOptions.targetWidth = 640;
        baseOptions.useKeyframes = true;
        break;
      case 'auto':
      default:
        baseOptions.quality = method === 'basic' ? 0.7 : 0.85;
        baseOptions.targetWidth = 320;
        baseOptions.useKeyframes = method !== 'basic';
        break;
    }

    switch (options.speed) {
      case 'fast':
        baseOptions.timeout = 3000;
        baseOptions.useKeyframes = false;
        break;
      case 'quality':
        baseOptions.timeout = 15000;
        baseOptions.useKeyframes = true;
        baseOptions.numKeyframes = 7;
        break;
      case 'balanced':
      case 'auto':
      default:
        baseOptions.timeout = 8000;
        baseOptions.useKeyframes = method !== 'basic';
        baseOptions.numKeyframes = 5;
        break;
    }

    if (method === 'enhanced' || method === 'webcodecs') {
      baseOptions.enableProgressiveRendering = options.progressive;
      baseOptions.preferredFormats = ['webp', 'jpeg'];
    }

    return baseOptions as ThumbnailGenerationOptions & WebCodecsThumbnailOptions;
  }

  private static getCacheKey(file: File): string {
    return `thumb_${file.name}_${file.size}_${file.lastModified}`;
  }

  private static getCachedThumbnail(
    cacheKey: string,
    file: File,
    options: AdaptiveOptions,
  ): Promise<ThumbnailCacheEntry | null> {
    if (options.cacheStrategy === 'none') return Promise.resolve(null);

    if (options.cacheStrategy === 'memory') {
      const cached = this.cache.get(cacheKey);
      if (cached && this.isCacheEntryValid(cached, file)) {
        return Promise.resolve(cached);
      }
    }

    // IndexedDB caching would be implemented here
    // For now, just return null
    return Promise.resolve(null);
  }

  private static cacheThumbnail(
    cacheKey: string,
    result: ThumbnailResult,
    method: string,
    file: File,
    options: AdaptiveOptions,
  ): Promise<void> {
    if (options.cacheStrategy === 'none') return Promise.resolve();

    const entry: ThumbnailCacheEntry = {
      thumbnail: result.thumbnail,
      metadata: result.metadata,
      timestamp: Date.now(),
      method,
      fileSize: file.size,
      fileLastModified: file.lastModified,
    };

    if (options.cacheStrategy === 'memory') {
      // Check cache size limit
      const estimatedSize = this.estimateCacheEntrySize(entry);
      if (estimatedSize < options.maxCacheSize * 1024 * 1024) {
        this.cache.set(cacheKey, entry);
        this.cleanupCache(options.maxCacheSize);
      }
    }

    // IndexedDB caching would be implemented here
    return Promise.resolve();
  }

  private static isCacheEntryValid(entry: ThumbnailCacheEntry, file: File): boolean {
    return (
      entry.fileSize === file.size &&
      entry.fileLastModified === file.lastModified &&
      Date.now() - entry.timestamp < 24 * 60 * 60 * 1000 // 24 hours
    );
  }

  private static estimateCacheEntrySize(entry: ThumbnailCacheEntry): number {
    // Estimate the memory size of a cache entry
    const thumbnailSize = entry.thumbnail.dataUrl.length * 2; // Rough estimate
    const metadataSize = 1000; // Rough estimate
    return thumbnailSize + metadataSize;
  }

  private static cleanupCache(maxSizeMB: number): void {
    const maxSize = maxSizeMB * 1024 * 1024;
    let currentSize = 0;

    // Calculate current cache size
    for (const entry of Array.from(this.cache.values())) {
      currentSize += this.estimateCacheEntrySize(entry);
    }

    if (currentSize <= maxSize) return;

    // Sort entries by timestamp (oldest first)
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );

    // Remove oldest entries until under limit
    for (const [key, entry] of entries) {
      this.cache.delete(key);
      currentSize -= this.estimateCacheEntrySize(entry);

      if (currentSize <= maxSize * 0.8) break; // Leave some buffer
    }
  }

  private static assessThumbnailQuality(thumbnail: VideoThumbnail): number {
    // Simple quality assessment based on data URL size and format
    if (!thumbnail.dataUrl || thumbnail.dataUrl.startsWith('data:image/svg+xml')) {
      return 0.1; // Placeholder
    }

    const sizeScore = Math.min(thumbnail.dataUrl.length / 50000, 1); // Normalize by ~50KB
    const formatScore = thumbnail.dataUrl.includes('webp') ? 1 : 0.8;

    return sizeScore * formatScore;
  }

  private static recordPerformance(metrics: PerformanceMetrics): void {
    this.performanceHistory.push(metrics);

    if (this.performanceHistory.length > this.MAX_HISTORY_SIZE) {
      this.performanceHistory.splice(0, this.performanceHistory.length - this.MAX_HISTORY_SIZE);
    }
  }

  // Public API methods
  static clearCache(): void {
    this.cache.clear();
  }

  static getCacheStats(): {
    entryCount: number;
    estimatedSizeMB: number;
    hitRate: number;
  } {
    let totalSize = 0;
    for (const entry of Array.from(this.cache.values())) {
      totalSize += this.estimateCacheEntrySize(entry);
    }

    const recentMetrics = this.performanceHistory.slice(-50);
    const hitRate =
      recentMetrics.length > 0
        ? recentMetrics.filter((m) => m.cacheHit).length / recentMetrics.length
        : 0;

    return {
      entryCount: this.cache.size,
      estimatedSizeMB: totalSize / (1024 * 1024),
      hitRate,
    };
  }

  static getPerformanceReport(): {
    totalOperations: number;
    averageDuration: number;
    successRate: number;
    methodDistribution: Record<string, number>;
  } {
    const total = this.performanceHistory.length;
    if (total === 0) {
      return {
        totalOperations: 0,
        averageDuration: 0,
        successRate: 0,
        methodDistribution: {},
      };
    }

    const avgDuration = this.performanceHistory.reduce((sum, m) => sum + m.duration, 0) / total;
    const successRate = this.performanceHistory.filter((m) => m.success).length / total;

    const methodCounts = this.performanceHistory.reduce(
      (acc, m) => {
        acc[m.method] = (acc[m.method] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalOperations: total,
      averageDuration: avgDuration,
      successRate,
      methodDistribution: methodCounts,
    };
  }
}
