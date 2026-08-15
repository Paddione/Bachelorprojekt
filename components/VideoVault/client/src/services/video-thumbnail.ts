import type { VideoThumbnail, VideoMetadata } from '../types/video';
import { ThumbnailGenerators } from './thumbnail-generators';
import { thumbnailCache } from './thumbnail-cache';

export class VideoThumbnailService {
  static async generateThumbnail(file: File): Promise<VideoThumbnail> {
    return ThumbnailGenerators.generateThumbnail(file);
  }

  static async extractVideoMetadata(file: File): Promise<VideoMetadata> {
    return ThumbnailGenerators.extractVideoMetadata(file);
  }

  static generatePlaceholderThumbnail(filename: string): VideoThumbnail {
    return thumbnailCache.generatePlaceholderThumbnail(filename);
  }

  static async tryReadExternalThumbnail(
    parentDirHandle: FileSystemDirectoryHandle,
    filename: string,
  ): Promise<VideoThumbnail | null> {
    return thumbnailCache.tryReadExternalThumbnail(parentDirHandle, filename);
  }

  static async tryReadExternalSprite(
    parentDirHandle: FileSystemDirectoryHandle,
    filename: string,
  ): Promise<string | null> {
    return thumbnailCache.tryReadExternalSprite(parentDirHandle, filename);
  }

  static async tryReadExternalThumbnailsForVideo(
    videoId: string,
    filename: string,
  ): Promise<string[]> {
    return thumbnailCache.tryReadExternalThumbnailsForVideo(videoId, filename);
  }

  static determineQuality(width: number, height: number): string {
    return thumbnailCache.determineQuality(width, height);
  }

  static async captureFrameAtTime(
    sourceUrl: string,
    timeSeconds: number,
    targetWidth = 160,
    quality = 0.8,
  ): Promise<string> {
    return ThumbnailGenerators.captureFrameAtTime(sourceUrl, timeSeconds, targetWidth, quality);
  }

  static async waitForDecodableFrame(video: HTMLVideoElement, timeoutMs = 1500): Promise<void> {
    return ThumbnailGenerators.waitForDecodableFrame(video, timeoutMs);
  }
}
