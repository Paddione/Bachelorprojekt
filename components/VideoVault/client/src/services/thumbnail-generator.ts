import { VideoThumbnailService } from './video-thumbnail';
import { VideoThumbnail } from '../types/video';
import { FileHandleRegistry } from './file-handle-registry';
import { VideoUrlRegistry } from './video-url-registry';
import type { AdaptiveOptions } from '@/services/adaptive-thumbnail-manager';
import { AdaptiveThumbnailManager as AdaptiveThumbnailManagerReal } from '@/services/adaptive-thumbnail-manager';
const AdaptiveThumbnailManager: any = AdaptiveThumbnailManagerReal;
import { EnhancedThumbnailService } from '@/services/enhanced-thumbnail-service';
import { AppSettingsService } from '@/services/app-settings';
import { ThumbnailFetcher } from './thumbnail-fetcher';

/**
 * Enhanced thumbnail generation service that provides retry logic,
 * caching, and fallback strategies for robust thumbnail generation
 */
export class ThumbnailGenerator {
  private static generatingThumbnails = new Set<string>();
  private static thumbnailCache = new Map<string, VideoThumbnail>();
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate thumbnail for a video with retry logic and caching
   */
  static async generateThumbnailForVideo(
    videoId: string,
    fallbackFilename?: string,
    adaptiveOptions?: Partial<AdaptiveOptions>,
  ): Promise<VideoThumbnail | null> {
    // Avoid duplicate generation requests
    if (this.generatingThumbnails.has(videoId)) {
      return null;
    }

    // Check cache first
    const cached = this.thumbnailCache.get(videoId);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    this.generatingThumbnails.add(videoId);

    try {
      // Strategy 0: Try server-side thumbnail first (preferred)
      try {
        const serverThumbnailUrl = await ThumbnailFetcher.fetchThumbnail(videoId, 'thumbnail');
        if (serverThumbnailUrl) {
          const serverThumbnail: VideoThumbnail = {
            dataUrl: serverThumbnailUrl,
            generated: true,
            timestamp: new Date().toISOString(),
          };
          this.cacheThumbnail(videoId, serverThumbnail);
          return serverThumbnail;
        }
      } catch (serverError) {
        // Server thumbnail not available, fall back to client generation
        console.info(`Server thumbnail not available for ${videoId}, using client generation`);
      }

      // Strategy 1: Try adaptive thumbnail generation with file handle
      const thumbnail = await this.tryGenerateAdaptiveFromFileHandle(videoId, adaptiveOptions);
      if (thumbnail) {
        this.cacheThumbnail(videoId, thumbnail);
        return thumbnail;
      }

      // Strategy 2: Try adaptive thumbnail generation with video URL registry
      const urlThumbnail = await this.tryGenerateAdaptiveFromVideoUrl(videoId, adaptiveOptions);
      if (urlThumbnail) {
        this.cacheThumbnail(videoId, urlThumbnail);
        return urlThumbnail;
      }

      // Strategy 3: Fallback to basic file handle method
      const basicThumbnail = await this.tryGenerateFromFileHandle(videoId);
      if (basicThumbnail) {
        this.cacheThumbnail(videoId, basicThumbnail);
        return basicThumbnail;
      }

      // Strategy 4: Fallback to basic URL method
      const basicUrlThumbnail = await this.tryGenerateFromVideoUrl(videoId);
      if (basicUrlThumbnail) {
        this.cacheThumbnail(videoId, basicUrlThumbnail);
        return basicUrlThumbnail;
      }

      // Strategy 5: Generate placeholder with filename
      const placeholder = VideoThumbnailService.generatePlaceholderThumbnail(
        fallbackFilename || `video-${videoId}`,
      );
      this.cacheThumbnail(videoId, placeholder);
      return placeholder;
    } catch (error) {
      console.warn(`Failed to generate thumbnail for video ${videoId}:`, error);
      // Return a generic placeholder on complete failure
      try {
        const fallback = VideoThumbnailService.generatePlaceholderThumbnail(
          fallbackFilename || 'Unknown Video',
        );
        return fallback;
      } catch (placeholderError) {
        console.warn(`Failed to generate placeholder for video ${videoId}:`, placeholderError);
        // Return minimal fallback when even placeholder fails
        return {
          dataUrl:
            'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDI0MCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyNDAiIGhlaWdodD0iMTgwIiBmaWxsPSIjMkEyQTJBIi8+Cjx0ZXh0IHg9IjEyMCIgeT0iOTAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0Ij5ObyBUaHVtYm5haWw8L3RleHQ+Cjwvc3ZnPg==',
          generated: false,
          timestamp: new Date().toISOString(),
        };
      }
    } finally {
      this.generatingThumbnails.delete(videoId);
    }
  }

  /**
   * Progressive generation: emit a quick low-res frame, then upgrade to a high-res
   * keyframe-based thumbnail and optional sprite sheet (if supported).
   * onUpdate is called as results become available.
   */
  static async generateProgressiveForVideo(
    videoId: string,
    fallbackFilename?: string,
    adaptiveOptions?: Partial<AdaptiveOptions>,
    onUpdate?: (update: {
      low?: VideoThumbnail;
      high?: VideoThumbnail;
      spriteSheet?: string;
    }) => void,
  ): Promise<void> {
    // Resolve a File to operate on (prefer FileSystemHandle; fallback to blob URL)
    let file: File | null = null;
    try {
      const handle = FileHandleRegistry.get(videoId);
      if (handle) {
        file = await handle.getFile();
      } else {
        const url = VideoUrlRegistry.get(videoId);
        if (url) {
          const res = await fetch(url);
          const blob = await res.blob();
          file = new File([blob], fallbackFilename || `video-${videoId}.mp4`, { type: blob.type });
        }
      }
    } catch (_e) {
      file = null;
    }

    if (!file) {
      // Fall back to placeholder if no file source is available
      const placeholder = VideoThumbnailService.generatePlaceholderThumbnail(
        fallbackFilename || `video-${videoId}`,
      );
      onUpdate?.({ low: placeholder });
      return;
    }

    // Check settings for sprite toggle
    let enableSprite = true;
    try {
      const s = await AppSettingsService.get<any>('vv.settings');
      if (s && typeof s.enableSpriteThumbnails === 'boolean') {
        enableSprite = !!s.enableSpriteThumbnails;
      }
    } catch {}

    // Low-quality fast pass (aim < ~1s)
    const lowOpts = {
      quality: 0.6,
      targetWidth: 160,
      useKeyframes: false,
      timeout: 4000,
      enableProgressiveRendering: false,
      preferredFormats: ['webp', 'jpeg'],
    };

    // High-quality pass with keyframes and optional sprite sheet
    const highOpts = {
      quality: 0.9,
      targetWidth: adaptiveOptions?.quality === 'high' ? 640 : 320,
      useKeyframes: true,
      numKeyframes: 5,
      timeout: 12000,
      enableProgressiveRendering: true,
      enableSpriteSheet: enableSprite,
      preferredFormats: ['webp', 'jpeg'],
      generateMultipleThumbnails: true,
    };

    // Fire low-res pass and surface immediately
    try {
      const lowRes = await EnhancedThumbnailService.generateEnhancedThumbnail(file, lowOpts);
      if (lowRes?.thumbnail) {
        this.cacheThumbnail(videoId, lowRes.thumbnail);
        onUpdate?.({ low: lowRes.thumbnail });
      }
    } catch (_e) {
      // ignore; high pass or placeholder will cover
    }

    // Start high-res in background; update when ready
    try {
      const highRes = await EnhancedThumbnailService.generateEnhancedThumbnail(file, highOpts);
      if (highRes?.thumbnail) {
        this.cacheThumbnail(videoId, highRes.thumbnail);
        onUpdate?.({ high: highRes.thumbnail, spriteSheet: highRes.spriteSheet });
      }
    } catch (_e) {
      // ignore failures silently; caller still has low-res or placeholder
    }
  }

  /**
   * Try to generate adaptive thumbnail from file handle
   */
  private static async tryGenerateAdaptiveFromFileHandle(
    videoId: string,
    adaptiveOptions?: Partial<AdaptiveOptions>,
  ): Promise<VideoThumbnail | null> {
    try {
      const handle = FileHandleRegistry.get(videoId);
      if (!handle) return null;

      const file = await handle.getFile();
      if (!file) return null;

      const result = await AdaptiveThumbnailManager.generateAdaptiveThumbnail(
        file,
        adaptiveOptions || {},
      );
      const thumbnail = (result as { thumbnail?: VideoThumbnail })?.thumbnail;
      return thumbnail ?? null;
    } catch (error) {
      console.warn(`Failed to generate adaptive thumbnail from file handle for ${videoId}:`, error);
      return null;
    }
  }

  /**
   * Try to generate adaptive thumbnail from video URL
   */
  private static async tryGenerateAdaptiveFromVideoUrl(
    videoId: string,
    adaptiveOptions?: Partial<AdaptiveOptions>,
  ): Promise<VideoThumbnail | null> {
    try {
      const url = VideoUrlRegistry.get(videoId);
      if (!url) return null;

      // Convert blob URL to file for adaptive processing
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `video-${videoId}.mp4`, { type: blob.type });

      const result = await AdaptiveThumbnailManager.generateAdaptiveThumbnail(
        file,
        adaptiveOptions || {},
      );
      const thumbnail = (result as { thumbnail?: VideoThumbnail })?.thumbnail;
      return thumbnail ?? null;
    } catch (error) {
      console.warn(`Failed to generate adaptive thumbnail from video URL for ${videoId}:`, error);
      return null;
    }
  }

  /**
   * Try to generate thumbnail from file handle (basic method)
   */
  private static async tryGenerateFromFileHandle(videoId: string): Promise<VideoThumbnail | null> {
    try {
      const handle = FileHandleRegistry.get(videoId);
      if (!handle) return null;

      const file = await handle.getFile();
      if (!file) return null;

      return await VideoThumbnailService.generateThumbnail(file);
    } catch (error) {
      console.warn(`Failed to generate thumbnail from file handle for ${videoId}:`, error);
      return null;
    }
  }

  /**
   * Try to generate thumbnail from video URL
   */
  private static async tryGenerateFromVideoUrl(videoId: string): Promise<VideoThumbnail | null> {
    try {
      const videoUrl = VideoUrlRegistry.get(videoId);
      if (!videoUrl) return null;

      // Create a temporary video element to extract a frame
      return await this.generateThumbnailFromUrl(videoUrl);
    } catch (error) {
      console.warn(`Failed to generate thumbnail from video URL for ${videoId}:`, error);
      return null;
    }
  }

  /**
   * Generate thumbnail from a video URL by creating a temporary video element
   */
  private static async generateThumbnailFromUrl(videoUrl: string): Promise<VideoThumbnail | null> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.crossOrigin = 'anonymous';

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      }, 5000);

      const cleanup = () => {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.onseeked = null;
        video.onerror = null;
        clearTimeout(timeout);
      };

      const capture = async () => {
        if (resolved) return;

        try {
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            resolve(null);
            return;
          }

          const canvas = document.createElement('canvas');
          const aspectRatio =
            video.videoWidth > 0 && video.videoHeight > 0
              ? video.videoWidth / video.videoHeight
              : 16 / 9;

          canvas.width = 320;
          canvas.height = Math.max(1, Math.round(320 / aspectRatio));

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

          resolved = true;
          cleanup();
          resolve({
            dataUrl,
            generated: true,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.warn('Failed to capture frame from video URL:', error);
          resolved = true;
          cleanup();
          resolve(null);
        }
      };

      video.onloadedmetadata = () => {
        if (resolved) return;

        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        // Generate thumbnail at 50% runtime
        const minEdgeOffset = duration > 0 ? Math.min(1, Math.max(0.1, duration * 0.05)) : 0;
        const midpoint = duration > 0 ? duration * 0.5 : 0;
        const target =
          duration > 0
            ? Math.max(minEdgeOffset, Math.min(midpoint, Math.max(0, duration - minEdgeOffset)))
            : 0;

        try {
          if (target > 0 && target !== video.currentTime) {
            video.currentTime = Math.max(0, Math.min(target, video.duration || 0));
          } else {
            capture().catch(() => resolve(null));
          }
        } catch {
          resolve(null);
        }
      };

      video.onloadeddata = () => {
        if (!resolved) {
          capture().catch(() => resolve(null));
        }
      };

      video.onseeked = () => {
        if (!resolved) {
          capture().catch(() => resolve(null));
        }
      };

      video.onerror = () => {
        resolved = true;
        cleanup();
        resolve(null);
      };

      video.src = videoUrl;
    });
  }

  /**
   * Cache a thumbnail with timestamp
   */
  private static cacheThumbnail(videoId: string, thumbnail: VideoThumbnail): void {
    this.thumbnailCache.set(videoId, {
      ...thumbnail,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if cached thumbnail is still valid
   */
  private static isCacheValid(thumbnail: VideoThumbnail): boolean {
    const cacheTime = new Date(thumbnail.timestamp).getTime();
    const now = Date.now();
    return now - cacheTime < this.CACHE_DURATION;
  }

  /**
   * Clear thumbnail cache for a specific video
   */
  static clearCache(videoId?: string): void {
    if (videoId) {
      this.thumbnailCache.delete(videoId);
    } else {
      this.thumbnailCache.clear();
      AdaptiveThumbnailManager.clearCache();
    }
  }

  /**
   * Get cache size for debugging
   */
  static getCacheSize(): number {
    return this.thumbnailCache.size;
  }

  /**
   * Get thumbnail cache statistics from adaptive manager
   */
  static getCacheStats(): { entryCount: number; estimatedSizeMB: number; hitRate: number } {
    return (
      (AdaptiveThumbnailManager.getCacheStats() as {
        entryCount: number;
        estimatedSizeMB: number;
        hitRate: number;
      }) || { entryCount: 0, estimatedSizeMB: 0, hitRate: 0 }
    );
  }

  /**
   * Get thumbnail generation performance report
   */
  static getPerformanceReport(): {
    totalOperations: number;
    averageDuration: number;
    successRate: number;
    methodDistribution: Record<string, number>;
  } {
    return (
      (AdaptiveThumbnailManager.getPerformanceReport() as {
        totalOperations: number;
        averageDuration: number;
        successRate: number;
        methodDistribution: Record<string, number>;
      }) || { totalOperations: 0, averageDuration: 0, successRate: 0, methodDistribution: {} }
    );
  }

  /**
   * Generate thumbnail with high quality settings
   */
  static async generateHighQualityThumbnail(
    videoId: string,
    fallbackFilename?: string,
  ): Promise<VideoThumbnail | null> {
    return this.generateThumbnailForVideo(videoId, fallbackFilename, {
      quality: 'high',
      speed: 'quality',
      progressive: true,
      cacheStrategy: 'memory',
      generateMultipleThumbnails: true,
    });
  }

  /**
   * Generate thumbnail optimized for speed
   */
  static async generateFastThumbnail(
    videoId: string,
    fallbackFilename?: string,
  ): Promise<VideoThumbnail | null> {
    return this.generateThumbnailForVideo(videoId, fallbackFilename, {
      quality: 'low',
      speed: 'fast',
      progressive: false,
      cacheStrategy: 'memory',
      generateMultipleThumbnails: true,
    });
  }
}
