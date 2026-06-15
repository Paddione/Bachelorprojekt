// Logger replacement - using console for client-side

export interface ThumbnailMetadata {
  type: 'thumbnail' | 'sprite';
  width: number;
  height: number;
  format: string;
  fileSize: number;
  quality?: number;
  frameCount?: number;
  tileLayout?: string;
  generatedBy: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Thumbnail Fetcher Service
 *
 * Fetches thumbnails from server instead of generating client-side
 * Features:
 * - In-memory blob URL cache
 * - Deduplication (prevents concurrent fetches)
 * - Fallback to client generation if server unavailable
 * - Prefetch API for batch loading
 * - Automatic cleanup of blob URLs
 */
export class ThumbnailFetcher {
  private static cache = new Map<string, string>(); // cacheKey -> blob URL
  private static pendingRequests = new Map<string, Promise<string>>();
  private static metadataCache = new Map<string, ThumbnailMetadata[]>();

  /**
   * Fetch thumbnail from server
   *
   * @param videoId - Video ID
   * @param type - 'thumbnail' | 'sprite'
   * @param fallbackGenerator - Optional fallback if server unavailable
   * @returns Promise<string> - Blob URL for the thumbnail
   */
  static async fetchThumbnail(
    videoId: string,
    type: 'thumbnail' | 'sprite' = 'thumbnail',
    fallbackGenerator?: () => Promise<string>,
  ): Promise<string> {
    const cacheKey = `${videoId}:${type}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      const url = this.cache.get(cacheKey)!;
      // Verify blob URL is still valid
      if (url.startsWith('blob:')) {
        try {
          // Quick check if blob URL is accessible
          await fetch(url, { method: 'HEAD' });
          return url;
        } catch {
          // Blob URL expired, remove from cache
          this.cache.delete(cacheKey);
          URL.revokeObjectURL(url);
        }
      } else {
        return url;
      }
    }

    // Check pending requests (deduplication)
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)!;
    }

    // Fetch from server
    const promise = this.fetchFromServer(videoId, type, fallbackGenerator);
    this.pendingRequests.set(cacheKey, promise);

    try {
      const url = await promise;
      this.cache.set(cacheKey, url);
      return url;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Internal method to fetch from server
   */
  private static async fetchFromServer(
    videoId: string,
    type: string,
    fallbackGenerator?: () => Promise<string>,
  ): Promise<string> {
    try {
      const response = await fetch(`/api/thumbnails/${videoId}?type=${type}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        // Thumbnail not found on server
        if (response.status === 404) {
          console.info(`[ThumbnailFetcher] Thumbnail not found on server: ${videoId}`, {
            type,
          });

          // Use fallback generator if provided
          if (fallbackGenerator) {
            console.info(`[ThumbnailFetcher] Using fallback generator for: ${videoId}`);
            return await fallbackGenerator();
          }

          throw new Error(`Thumbnail not found: ${videoId} (${type})`);
        }

        throw new Error(`Failed to fetch thumbnail: ${response.status}`);
      }

      // Convert response to blob and create blob URL
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      console.debug(`[ThumbnailFetcher] Fetched thumbnail from server: ${videoId}`, {
        type,
        size: blob.size,
      });

      return blobUrl;
    } catch (error: any) {
      console.warn(`[ThumbnailFetcher] Failed to fetch from server: ${videoId}`, {
        error: error.message,
      });

      // Use fallback generator if available
      if (fallbackGenerator) {
        console.info(`[ThumbnailFetcher] Using fallback generator for: ${videoId}`);
        return await fallbackGenerator();
      }

      throw error;
    }
  }

  /**
   * Fetch thumbnail metadata without downloading the file
   */
  static async fetchMetadata(videoId: string): Promise<ThumbnailMetadata[]> {
    // Check metadata cache
    if (this.metadataCache.has(videoId)) {
      return this.metadataCache.get(videoId)!;
    }

    try {
      const response = await fetch(`/api/thumbnails/${videoId}/metadata`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        throw new Error(`Failed to fetch metadata: ${response.status}`);
      }

      const data = (await response.json()) as { videoId: string; thumbnails: ThumbnailMetadata[] };
      const metadata = data.thumbnails || [];

      // Cache metadata
      this.metadataCache.set(videoId, metadata);

      return metadata;
    } catch (error: any) {
      console.warn(`[ThumbnailFetcher] Failed to fetch metadata: ${videoId}`, {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Check if thumbnail exists on server
   */
  static async hasThumbnail(
    videoId: string,
    type: 'thumbnail' | 'sprite' = 'thumbnail',
  ): Promise<boolean> {
    const metadata = await this.fetchMetadata(videoId);
    return metadata.some((m) => m.type === type);
  }

  /**
   * Prefetch thumbnails in batches
   * Useful for preloading thumbnails for videos in viewport
   */
  static async prefetch(
    videoIds: string[],
    type: 'thumbnail' | 'sprite' = 'thumbnail',
    batchSize: number = 10,
  ): Promise<void> {
    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map((id) =>
          this.fetchThumbnail(id, type).catch(() => {
            // Ignore errors during prefetch
          }),
        ),
      );
    }
  }

  /**
   * Clear cache for a specific video or all videos
   */
  static clearCache(videoId?: string) {
    if (videoId) {
      // Clear specific video
      const keys = Array.from(this.cache.keys()).filter((k) => k.startsWith(videoId));
      keys.forEach((key) => {
        const url = this.cache.get(key);
        if (url?.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
        this.cache.delete(key);
      });
      this.metadataCache.delete(videoId);
    } else {
      // Clear all
      this.cache.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      this.cache.clear();
      this.metadataCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    thumbnailCount: number;
    metadataCount: number;
    pendingRequests: number;
  } {
    return {
      thumbnailCount: this.cache.size,
      metadataCount: this.metadataCache.size,
      pendingRequests: this.pendingRequests.size,
    };
  }

  /**
   * Cleanup expired blob URLs
   * Should be called periodically (e.g., on component unmount)
   */
  static cleanup() {
    const expiredKeys: string[] = [];

    this.cache.forEach(async (url, key) => {
      if (url.startsWith('blob:')) {
        try {
          // Try to fetch blob URL
          await fetch(url, { method: 'HEAD' });
        } catch {
          // Blob URL expired
          expiredKeys.push(key);
          URL.revokeObjectURL(url);
        }
      }
    });

    expiredKeys.forEach((key) => this.cache.delete(key));

    if (expiredKeys.length > 0) {
      console.debug(`[ThumbnailFetcher] Cleaned up ${expiredKeys.length} expired blob URLs`);
    }
  }

  /**
   * Convert data URL to blob URL (for migration from old system)
   */
  static dataUrlToBlobUrl(dataUrl: string): string {
    try {
      const [header, data] = dataUrl.split(',');
      const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
      const binary = atob(data);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([array], { type: mime });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('[ThumbnailFetcher] Failed to convert data URL to blob URL', error);
      return dataUrl; // Return original on error
    }
  }
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    ThumbnailFetcher.clearCache();
  });
}
