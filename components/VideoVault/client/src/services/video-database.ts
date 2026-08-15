import { Video, Category, CustomCategories } from '../types/video';
import { CategoryNormalizer } from './category-normalizer';
import { serverHealth } from './server-health';
import { ApiClient } from './api-client';

export class VideoDatabase {
  // In-memory cache only. DB is the source of truth.
  private static memoryCache: Video[] = [];

  // For export/localStorage only: strip large data URLs to keep storage footprint small
  private static sanitizeVideoForLocalStorage(video: Video): Video {
    return {
      ...video,
      thumbnail: {
        dataUrl: '',
        generated: video.thumbnail?.generated ?? false,
        timestamp: video.thumbnail?.timestamp || '',
        thumbnails: undefined, // Remove thumbnails array to keep storage footprint small
      },
    };
  }

  private static sanitizeVideosForLocalStorage(videos: Video[]): Video[] {
    return videos.map((v) => this.sanitizeVideoForLocalStorage(v));
  }

  static prepareVideosForExport(videos: Video[]): Video[] {
    return this.sanitizeVideosForLocalStorage(videos);
  }

  private static normalizeLoadedVideos(videos: any[]): Video[] {
    // Ensure required shape. Keep thumbnail from server if provided.
    return (videos || []).map((v: any) => {
      const safeThumb = {
        dataUrl: typeof v.thumbnail?.dataUrl === 'string' ? v.thumbnail.dataUrl : '',
        generated: !!v.thumbnail?.generated,
        timestamp:
          v.thumbnail && typeof v.thumbnail.timestamp === 'string' ? v.thumbnail.timestamp : '',
        thumbnails:
          v.thumbnail && Array.isArray(v.thumbnail.thumbnails) ? v.thumbnail.thumbnails : undefined,
      };
      const normalized: Video = {
        ...v,
        thumbnail: safeThumb,
      } as Video;
      // Normalize categories on load
      normalized.categories = CategoryNormalizer.normalizeStandardCategories(normalized.categories);
      normalized.customCategories = CategoryNormalizer.normalizeCustomCategories(
        normalized.customCategories,
      );
      return normalized;
    });
  }

  static loadFromStorage(): Video[] {
    return this.memoryCache;
  }

  static saveToStorage(videos: Video[]): void {
    // Update in-memory cache only
    this.memoryCache = this.sanitizeVideosForLocalStorage(videos);
  }

  // Remote-aware loaders
  static async load(): Promise<Video[]> {
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return this.loadFromStorage();
    try {
      const rows = await ApiClient.get<any[]>(`/api/videos`);
      const normalized = this.normalizeLoadedVideos(rows);
      // Deduplicate by filename+size — server may have entries with different IDs
      // for the same physical file (client vs server ID generation mismatch)
      const seen = new Map<string, number>();
      const deduped = normalized.filter((v, i) => {
        const key = `${v.filename}\0${v.size}`;
        if (seen.has(key)) return false;
        seen.set(key, i);
        return true;
      });
      this.saveToStorage(deduped);
      return deduped;
    } catch {
      serverHealth.markUnhealthy();
      return this.loadFromStorage();
    }
  }

  static async loadTags(): Promise<any[]> {
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return [];
    try {
      return await ApiClient.get<any[]>('/api/tags');
    } catch {
      return [];
    }
  }

  static addVideo(videos: Video[], videoData: Video): Video[] {
    const existingIndex = videos.findIndex((v) => v.id === videoData.id);
    if (existingIndex >= 0) {
      videos[existingIndex] = videoData;
    } else {
      videos.push(videoData);
    }
    this.saveToStorage(videos);
    return videos;
  }

  static addVideos(existingVideos: Video[], newVideos: Video[]): Video[] {
    // Deduplicate by both id AND filename+size to handle client/server ID mismatch.
    // Client generates IDs as btoa(filename-size-lastModified), server uses sha256(path).
    // Same physical file can have two different IDs — dedup by content identity too.
    const videoMap = new Map(existingVideos.map((v) => [v.id, v]));
    const contentKeyMap = new Map<string, string>(); // contentKey -> id
    for (const v of existingVideos) {
      contentKeyMap.set(`${v.filename}\0${v.size}`, v.id);
    }

    newVideos.forEach((video) => {
      const contentKey = `${video.filename}\0${video.size}`;
      const existingId = contentKeyMap.get(contentKey);

      // If same file exists under a different ID, remove the old entry
      if (existingId && existingId !== video.id) {
        videoMap.delete(existingId);
      }

      videoMap.set(video.id, video);
      contentKeyMap.set(contentKey, video.id);
    });

    const updatedVideos = Array.from(videoMap.values());
    this.saveToStorage(updatedVideos);
    // Persist to DB (best-effort)
    void this.syncBulkUpsert(updatedVideos);
    return updatedVideos;
  }

  static updateVideoCategories(
    videos: Video[],
    videoId: string,
    categories: Partial<{ categories: any; customCategories: CustomCategories }>,
  ): Video[] {
    const updatedVideos = videos.map((video) => {
      if (video.id === videoId) {
        const merged: Video = {
          ...video,
          ...categories,
        } as Video;
        // Normalize after merge
        merged.categories = CategoryNormalizer.normalizeStandardCategories(merged.categories);
        merged.customCategories = CategoryNormalizer.normalizeCustomCategories(
          merged.customCategories,
        );
        return merged;
      }
      return video;
    });

    this.saveToStorage(updatedVideos);
    void this.syncBulkUpsert(updatedVideos.filter((v) => v.id === videoId));
    return updatedVideos;
  }

  static removeCategory(
    videos: Video[],
    videoId: string,
    categoryType: string,
    categoryValue: string,
  ): Video[] {
    const updatedVideos = videos.map((video) => {
      if (video.id === videoId) {
        const updatedVideo = { ...video };

        if (categoryType === 'custom') {
          // Handle custom categories
          const [rawType, rawValue] = categoryValue.split(':');
          const customType = CategoryNormalizer.normalizeValue(rawType || '');
          const customValue = CategoryNormalizer.normalizeValue(rawValue || '');
          const existing = updatedVideo.customCategories || {};
          const normMap: CustomCategories = {};
          // Rebuild with normalized keys and values
          Object.entries(existing).forEach(([t, vals]) => {
            const nt = CategoryNormalizer.normalizeValue(t);
            const nvals = (vals || []).map((v) => CategoryNormalizer.normalizeValue(v));
            normMap[nt] = (normMap[nt] || []).concat(nvals);
          });
          if (normMap[customType]) {
            normMap[customType] = normMap[customType].filter((v) => v !== customValue);
            if (normMap[customType].length === 0) {
              delete normMap[customType];
            }
          }
          updatedVideo.customCategories = CategoryNormalizer.normalizeCustomCategories(normMap);
        } else {
          // Handle standard categories
          const typeKey = categoryType as keyof typeof updatedVideo.categories;
          const arr = Array.isArray(updatedVideo.categories[typeKey])
            ? [...updatedVideo.categories[typeKey]]
            : [];
          const target = CategoryNormalizer.normalizeValue(categoryValue);
          const filtered = arr.filter((v) => CategoryNormalizer.normalizeValue(v) !== target);
          (updatedVideo.categories as any)[typeKey] = CategoryNormalizer.normalizeArray(filtered);
        }

        return updatedVideo;
      }
      return video;
    });

    this.saveToStorage(updatedVideos);
    void this.syncBulkUpsert(updatedVideos.filter((v) => v.id === videoId));
    return updatedVideos;
  }

  static exportData(): string {
    const videos = this.loadFromStorage();
    const sanitized = this.prepareVideosForExport(videos);
    return JSON.stringify(
      {
        version: '1.0',
        exportDate: new Date().toISOString(),
        videos: sanitized,
        totalVideos: sanitized.length,
      },
      null,
      2,
    );
  }

  static importFromParsed(videos: any[]): Video[] {
    if (!Array.isArray(videos)) throw new Error('Invalid data format');
    const normalized = this.normalizeLoadedVideos(videos);
    this.saveToStorage(normalized);
    // sync entire import to DB
    void this.syncBulkUpsert(normalized);
    return normalized;
  }

  static importData(jsonData: string): Video[] {
    try {
      const data = JSON.parse(jsonData);
      const videos = Array.isArray(data) ? data : data.videos;
      if (!Array.isArray(videos)) throw new Error('Invalid data format');
      return this.importFromParsed(videos);
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed to import data:', error);
      }
      throw error;
    }
  }

  // Backups were previously stored in localStorage; they are no-ops now.
  static createBackup(_description?: string): void {
    /* no-op without local storage */
  }
  static getBackups(): any[] {
    return [];
  }
  static restoreFromBackup(_backupId: string): Video[] {
    return this.loadFromStorage();
  }
  private static _cleanup(): void {
    /* no-op */
  }

  static getAllCategories(videos: Video[]): Category[] {
    const categoryMap = new Map<string, number>();

    videos.forEach((video) => {
      // Standard categories
      Object.entries(video.categories).forEach(([type, values]) => {
        values.forEach((value: string) => {
          const key = `${type}:${CategoryNormalizer.normalizeValue(value)}`;
          categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
        });
      });

      // Custom categories
      Object.entries(video.customCategories).forEach(([type, values]) => {
        const normType = CategoryNormalizer.normalizeValue(type);
        values.forEach((value: string) => {
          const key = `custom:${normType}:${CategoryNormalizer.normalizeValue(value)}`;
          categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
        });
      });
    });

    return Array.from(categoryMap.entries()).map(([key, count]) => {
      const [type, ...valueParts] = key.split(':');
      const value = valueParts.join(':');
      const isCustom = type === 'custom';

      return {
        type: isCustom ? valueParts[0] : type,
        value: isCustom ? valueParts.slice(1).join(':') : value,
        count,
        isCustom,
      };
    });
  }

  static renameVideoInDb(
    videos: Video[],
    videoId: string,
    newDisplayName: string,
    newFilename?: string,
  ): Video[] {
    const updatedVideos = videos.map((video) => {
      if (video.id !== videoId) return video;
      return {
        ...video,
        displayName: newDisplayName,
        filename: newFilename ?? video.filename,
      };
    });
    this.saveToStorage(updatedVideos);
    // Sync to server (and sidecar) so displayName changes persist
    const changed = updatedVideos.find((v) => v.id === videoId);
    if (changed) void this.syncBulkUpsert([changed]);
    return updatedVideos;
  }

  static batchRenameInDb(
    videos: Video[],
    renames: Array<{ id: string; displayName: string; filename?: string }>,
  ): Video[] {
    const renameMap = new Map(renames.map((r) => [r.id, r]));
    const updated = videos.map((v) => {
      const r = renameMap.get(v.id);
      if (!r) return v;
      return { ...v, displayName: r.displayName, filename: r.filename ?? v.filename };
    });
    this.saveToStorage(updated);
    void this.syncBulkUpsert(updated.filter((v) => renames.some((r) => r.id === v.id)));
    return updated;
  }

  static updateVideoPath(
    videos: Video[],
    videoId: string,
    newRelativePath: string,
    rootKey?: string,
  ): Video[] {
    const updated = videos.map((v) =>
      v.id === videoId ? { ...v, path: newRelativePath, rootKey: rootKey ?? v.rootKey } : v,
    );
    this.saveToStorage(updated);
    void this.syncBulkUpsert(updated.filter((v) => v.id === videoId));
    return updated;
  }

  static removeVideo(videos: Video[], videoId: string): Video[] {
    const updated = videos.filter((v) => v.id !== videoId);
    this.saveToStorage(updated);
    void this.syncBatchDelete([videoId]);
    return updated;
  }

  static removeVideosByDirectory(videos: Video[], rootKey: string, dirPrefix: string): Video[] {
    const norm = dirPrefix.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const withSlash = norm ? `${norm}/` : '';
    const updated = videos.filter(
      (v) => !(v.rootKey === rootKey && (v.path === withSlash || v.path.startsWith(withSlash))),
    );
    const removedIds = videos.filter((v) => !updated.includes(v)).map((v) => v.id);
    this.saveToStorage(updated);
    void this.syncBatchDelete(removedIds);
    return updated;
  }

  static removeVideosByIds(videos: Video[], ids: string[]): Video[] {
    const idSet = new Set(ids);
    const updated = videos.filter((v) => !idSet.has(v.id));
    this.saveToStorage(updated);
    void this.syncBatchDelete(ids);
    return updated;
  }

  private static async syncBulkUpsert(videos: Video[] | undefined): Promise<void> {
    if (!videos || videos.length === 0) return;
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return;
    try {
      // Strip thumbnails array to reduce payload size for server sync
      const videosForSync = videos.map((v) => ({
        ...v,
        lastModified: v.lastModified,
        thumbnail: {
          dataUrl: v.thumbnail?.dataUrl || '',
          generated: v.thumbnail?.generated ?? false,
          timestamp: v.thumbnail?.timestamp || '',
          // Exclude thumbnails array from server sync
        },
      }));
      await ApiClient.post(`/api/videos/bulk_upsert`, { videos: videosForSync });
    } catch {
      serverHealth.markUnhealthy();
    }
  }

  // Update only thumbnail for a given video and sync
  static updateVideoThumbnail(
    videos: Video[],
    videoId: string,
    thumbnail: Video['thumbnail'],
  ): Video[] {
    const updated = videos.map((v) => (v.id === videoId ? { ...v, thumbnail } : v));
    this.saveToStorage(updated);
    void this.syncBulkUpsert(updated.filter((v) => v.id === videoId));
    return updated;
  }

  private static async syncBatchDelete(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
    const healthy = await serverHealth.isHealthy();
    if (!healthy) return;
    try {
      await ApiClient.post(`/api/videos/batch_delete`, { ids });
    } catch {
      serverHealth.markUnhealthy();
    }
  }

  // Exposed migration helper to push local data to server
  static async syncAllToServer(videos: Video[]): Promise<void> {
    await this.syncBulkUpsert(videos);
  }

  static async cleanupMissingVideos(): Promise<{ deletedCount: number; missingIds: string[] }> {
    const healthy = await serverHealth.isHealthy();
    if (!healthy) throw new Error('Server not reachable');
    return await ApiClient.post<{ deletedCount: number; missingIds: string[] }>(
      '/api/videos/cleanup_missing',
    );
  }
}
