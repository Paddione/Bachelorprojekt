import type { VideoThumbnail, VideoMetadata } from '../types/video';
import { VideoThumbnailService } from './video-thumbnail';
import { encodeImageBitmapInWorker, supportsThumbnailWorker } from './thumbnail-worker-bridge';

export interface ThumbnailGenerationOptions {
  quality?: number;
  targetWidth?: number;
  targetHeight?: number;
  useKeyframes?: boolean;
  numKeyframes?: number;
  fallbackToMidpoint?: boolean;
  timeout?: number;
  enableProgressiveRendering?: boolean;
  preferredFormats?: ('webp' | 'jpeg' | 'png')[];
  enableSpriteSheet?: boolean; // if true, attempt sprite generation when supported
  generateMultipleThumbnails?: boolean; // if true, generate 3 thumbnails for hover cycling
}

export interface KeyframeInfo {
  timestamp: number;
  quality: number;
  isIFrame?: boolean;
  motionScore?: number;
}

export interface SpriteSheetOptions {
  rows: number;
  cols: number;
  frameWidth: number;
  frameHeight: number;
  timestamps: number[];
  quality?: number;
}

export interface ThumbnailResult {
  thumbnail: VideoThumbnail;
  keyframes?: KeyframeInfo[];
  spriteSheet?: string;
  metadata: VideoMetadata;
}

export class EnhancedThumbnailService {
  private static readonly DEFAULT_OPTIONS: ThumbnailGenerationOptions = {
    quality: 0.85,
    targetWidth: 320,
    targetHeight: 0, // Auto-calculate based on aspect ratio
    useKeyframes: true,
    numKeyframes: 5,
    fallbackToMidpoint: true,
    timeout: 12000,
    enableProgressiveRendering: true,
    preferredFormats: ['webp', 'jpeg'],
    generateMultipleThumbnails: true,
  };

  static async generateEnhancedThumbnail(
    file: File,
    options: ThumbnailGenerationOptions = {},
  ): Promise<ThumbnailResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        let resolved = false;

        const cleanup = () => {
          video.pause();
          video.removeAttribute('src');
          video.load();
          URL.revokeObjectURL(objectUrl);
          video.onloadedmetadata = null;
          video.onloadeddata = null;
          video.onseeked = null;
          video.onerror = null;
        };

        const resolveSafe = (result: ThumbnailResult) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          cleanup();
          resolve(result);
        };

        const rejectSafe = (error: Error) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          cleanup();
          reject(error);
        };

        const timeoutId = window.setTimeout(() => {
          console.warn(
            'Enhanced thumbnail generation timed out, falling back to basic generation:',
            file.name,
          );
          // Fallback to basic thumbnail generation
          VideoThumbnailService.generateThumbnail(file)
            .then((thumbnail) => {
              const metadata = this.extractBasicMetadata(video);
              resolveSafe({ thumbnail, metadata });
            })
            .catch((error) =>
              rejectSafe(new Error(`Timeout and fallback failed: ${error.message}`)),
            );
        }, opts.timeout);

        video.onloadedmetadata = async () => {
          if (resolved) return;

          try {
            const metadata = this.extractVideoMetadata(video, file);

            if (opts.useKeyframes && video.duration > 0) {
              const result = await this.generateKeyframeThumbnail(video, metadata, opts);
              resolveSafe({ ...result, metadata });
            } else {
              // Fallback to midpoint thumbnail
              const thumbnail = await this.generateMidpointThumbnail(video, opts);
              resolveSafe({ thumbnail, metadata });
            }
          } catch (error) {
            console.warn('Enhanced thumbnail generation failed:', error);
            try {
              const fallbackThumbnail = await VideoThumbnailService.generateThumbnail(file);
              const basicMetadata = this.extractBasicMetadata(video);
              resolveSafe({ thumbnail: fallbackThumbnail, metadata: basicMetadata });
            } catch (fallbackError) {
              const errorMsg =
                fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
              rejectSafe(new Error(`Enhanced generation failed and fallback failed: ${errorMsg}`));
            }
          }
        };

        video.onerror = () => {
          if (resolved) return;
          rejectSafe(new Error(`Video loading error: ${video.error?.message || 'Unknown error'}`));
        };

        video.src = objectUrl;
        video.load();
      });
    } catch (error) {
      console.warn('Enhanced thumbnail service failed, falling back to basic:', error);
      const basicThumbnail = await VideoThumbnailService.generateThumbnail(file);
      const basicMetadata: VideoMetadata = {
        duration: 0,
        width: 0,
        height: 0,
        bitrate: 0,
        codec: '',
        fps: 0,
        aspectRatio: '0',
      };
      return { thumbnail: basicThumbnail, metadata: basicMetadata };
    }
  }

  private static async generateKeyframeThumbnail(
    video: HTMLVideoElement,
    metadata: VideoMetadata,
    options: ThumbnailGenerationOptions,
  ): Promise<{ thumbnail: VideoThumbnail; keyframes?: KeyframeInfo[]; spriteSheet?: string }> {
    const duration = video.duration;
    const numKeyframes = options.numKeyframes || 5;

    // Generate candidate timestamps - focus on avoiding beginning/end and finding good keyframes
    const candidateTimestamps = this.generateKeyframeTimestamps(duration, numKeyframes);

    // Analyze frames to find the best thumbnail
    const keyframes: KeyframeInfo[] = [];
    const frameAnalyses = [];

    for (const timestamp of candidateTimestamps) {
      try {
        await this.seekToTime(video, timestamp);
        const analysis = await this.analyzeFrame(video, timestamp);
        keyframes.push(analysis);
        frameAnalyses.push({ timestamp, analysis });
      } catch (error) {
        console.warn(`Failed to analyze frame at ${timestamp}:`, error);
      }
    }

    // Select best frame based on quality metrics
    const bestFrame = this.selectBestFrame(frameAnalyses);
    const thumbnailTimestamp = bestFrame ? bestFrame.timestamp : duration * 0.5;

    // Generate the actual thumbnail at the best timestamp
    await this.seekToTime(video, thumbnailTimestamp);
    const thumbnail = await this.captureFrame(video, options);

    // Generate multiple thumbnails for hover cycling if enabled
    let multipleThumbnails: string[] | undefined;
    if (options.generateMultipleThumbnails) {
      try {
        multipleThumbnails = await this.generateMultipleThumbnails(video, options);
        if (multipleThumbnails.length > 0) {
          thumbnail.thumbnails = multipleThumbnails;
        }
      } catch (error) {
        console.warn('Failed to generate multiple thumbnails:', error);
      }
    }

    // Optionally generate sprite sheet
    let spriteSheet: string | undefined;
    if (
      options.enableSpriteSheet &&
      options.enableProgressiveRendering &&
      candidateTimestamps.length > 2
    ) {
      try {
        spriteSheet = await this.generateSpriteSheet(video, {
          rows: 1,
          cols: Math.min(candidateTimestamps.length, 5),
          frameWidth: 64,
          frameHeight: Math.round(64 / (metadata.width / metadata.height)),
          timestamps: candidateTimestamps.slice(0, 5),
          quality: 0.7,
        });
      } catch (error) {
        console.warn('Failed to generate sprite sheet:', error);
      }
    }

    return { thumbnail, keyframes, spriteSheet };
  }

  private static generateKeyframeTimestamps(duration: number, count: number): number[] {
    if (duration <= 0 || count <= 0) return [0];

    const timestamps: number[] = [];
    const edgeBuffer = Math.min(2, duration * 0.1); // Avoid first/last 10% or 2 seconds
    const usableRange = Math.max(1, duration - 2 * edgeBuffer);

    if (count === 1) {
      timestamps.push(edgeBuffer + usableRange * 0.5);
    } else {
      // Use golden ratio and fibonacci-like spacing for more natural keyframe selection
      const goldenRatio = (1 + Math.sqrt(5)) / 2;

      for (let i = 0; i < count; i++) {
        const ratio = (i + 1) / (count + 1);
        // Apply golden ratio offset for more natural distribution
        const adjustedRatio = (ratio + ((i * 0.618034) % 1)) % 1;
        const timestamp = edgeBuffer + usableRange * adjustedRatio;
        timestamps.push(Math.max(0, Math.min(timestamp, duration - 0.1)));
      }
    }

    return timestamps.sort((a, b) => a - b);
  }

  private static async analyzeFrame(
    video: HTMLVideoElement,
    timestamp: number,
  ): Promise<KeyframeInfo> {
    // Simple frame quality analysis
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot create canvas context for frame analysis');

    canvas.width = Math.min(video.videoWidth, 160);
    canvas.height = Math.min(video.videoHeight, 120);

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Calculate quality metrics
    const quality = this.calculateFrameQuality(imageData);

    return {
      timestamp,
      quality,
      isIFrame: true, // We can't easily detect I-frames in HTML5, so assume true
      motionScore: 0.5, // Placeholder - would need more complex analysis
    };
  }

  private static calculateFrameQuality(imageData: ImageData): number {
    const data = imageData.data;
    let variance = 0;
    let brightness = 0;
    let edgeCount = 0;
    const pixelCount = data.length / 4;

    // Calculate brightness and variance (contrast indicator)
    const brightnesses: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const pixelBrightness = (r + g + b) / 3;
      brightnesses.push(pixelBrightness);
      brightness += pixelBrightness;
    }

    brightness /= pixelCount;

    for (const pixelBrightness of brightnesses) {
      variance += Math.pow(pixelBrightness - brightness, 2);
    }
    variance /= pixelCount;

    // Simple edge detection (higher edge count = more detail)
    const width = imageData.width;
    for (let i = 0; i < brightnesses.length - width - 1; i++) {
      if (i % width !== width - 1) {
        // Skip right edge
        const current = brightnesses[i];
        const right = brightnesses[i + 1];
        const bottom = brightnesses[i + width];

        if (Math.abs(current - right) > 30 || Math.abs(current - bottom) > 30) {
          edgeCount++;
        }
      }
    }

    // Normalize edge count
    const edgeDensity = edgeCount / pixelCount;

    // Quality score: balance between contrast and detail, avoid over/under exposure
    const contrastScore = Math.min(variance / 1000, 1); // Normalize variance
    const exposureScore = 1 - Math.abs(brightness - 127.5) / 127.5; // Penalize over/under exposure
    const detailScore = Math.min(edgeDensity * 10, 1); // Normalize edge density

    return contrastScore * 0.4 + exposureScore * 0.3 + detailScore * 0.3;
  }

  private static selectBestFrame(
    frameAnalyses: Array<{ timestamp: number; analysis: KeyframeInfo }>,
  ): { timestamp: number; analysis: KeyframeInfo } | null {
    if (frameAnalyses.length === 0) return null;

    // Sort by quality score and select the best
    frameAnalyses.sort((a, b) => b.analysis.quality - a.analysis.quality);
    return frameAnalyses[0];
  }

  private static async seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        reject(new Error(`Seek timeout to ${time}`));
      }, 3000);

      const onSeeked = () => {
        clearTimeout(timeoutId);
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };

      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = Math.max(0, Math.min(time, video.duration));
    });
  }

  private static async generateMidpointThumbnail(
    video: HTMLVideoElement,
    options: ThumbnailGenerationOptions,
  ): Promise<VideoThumbnail> {
    const midpoint = video.duration * 0.5;
    await this.seekToTime(video, midpoint);
    const thumbnail = await this.captureFrame(video, options);

    // Generate multiple thumbnails for hover cycling if enabled
    if (options.generateMultipleThumbnails) {
      try {
        const multipleThumbnails = await this.generateMultipleThumbnails(video, options);
        if (multipleThumbnails.length > 0) {
          thumbnail.thumbnails = multipleThumbnails;
        }
      } catch (error) {
        console.warn('Failed to generate multiple thumbnails for midpoint:', error);
      }
    }

    return thumbnail;
  }

  private static async captureFrame(
    video: HTMLVideoElement,
    options: ThumbnailGenerationOptions,
  ): Promise<VideoThumbnail> {
    const targetWidth = options.targetWidth || 320;
    const aspectRatio = video.videoWidth / video.videoHeight;
    const targetHeight = options.targetHeight || Math.round(targetWidth / aspectRatio);
    const quality = options.quality || 0.85;

    // Check format support and select best format
    const preferredFormats = options.preferredFormats || ['webp', 'jpeg'];
    const supportedFormat = this.selectBestFormat(preferredFormats);

    // Prefer worker + ImageBitmap pipeline when supported
    const canUseWorker = supportsThumbnailWorker() && 'createImageBitmap' in window;

    if (canUseWorker) {
      try {
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = targetWidth;
        captureCanvas.height = targetHeight;
        const captureCtx = captureCanvas.getContext('2d');

        if (!captureCtx) throw new Error('Failed to acquire canvas context for capture');

        // Apply image smoothing for better quality
        captureCtx.imageSmoothingEnabled = true;
        captureCtx.imageSmoothingQuality = 'high';

        captureCtx.drawImage(video, 0, 0, targetWidth, targetHeight);

        const bitmap = await createImageBitmap(captureCanvas);
        const dataUrl = await encodeImageBitmapInWorker(bitmap, targetWidth, targetHeight, quality);
        bitmap.close();

        return {
          dataUrl,
          generated: true,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.warn('Worker thumbnail encode failed, falling back to canvas:', error);
      }
    }

    // Canvas fallback path with enhanced quality
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('Failed to acquire canvas context');

    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const mimeType = `image/${supportedFormat}`;
    const dataUrl = canvas.toDataURL(mimeType, quality);

    return {
      dataUrl,
      generated: true,
      timestamp: new Date().toISOString(),
    };
  }

  private static selectBestFormat(
    preferredFormats: ('webp' | 'jpeg' | 'png')[],
  ): 'webp' | 'jpeg' | 'png' {
    // Check format support
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    for (const format of preferredFormats) {
      try {
        const testDataUrl = canvas.toDataURL(`image/${format}`, 0.8);
        if (testDataUrl.startsWith(`data:image/${format}`)) {
          return format;
        }
      } catch (error) {
        continue;
      }
    }

    return 'jpeg'; // Fallback to JPEG which is universally supported
  }

  private static async generateSpriteSheet(
    video: HTMLVideoElement,
    options: SpriteSheetOptions,
  ): Promise<string> {
    const { rows, cols, frameWidth, frameHeight, timestamps, quality = 0.8 } = options;

    const canvas = document.createElement('canvas');
    canvas.width = cols * frameWidth;
    canvas.height = rows * frameHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('Failed to acquire canvas context for sprite sheet');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (let i = 0; i < Math.min(timestamps.length, rows * cols); i++) {
      const timestamp = timestamps[i];
      const row = Math.floor(i / cols);
      const col = i % cols;

      try {
        await this.seekToTime(video, timestamp);

        const x = col * frameWidth;
        const y = row * frameHeight;

        ctx.drawImage(video, x, y, frameWidth, frameHeight);
      } catch (error) {
        console.warn(`Failed to capture sprite frame at ${timestamp}:`, error);
      }
    }

    return canvas.toDataURL('image/jpeg', quality);
  }

  private static async generateMultipleThumbnails(
    video: HTMLVideoElement,
    options: ThumbnailGenerationOptions,
  ): Promise<string[]> {
    const thumbnails: string[] = [];
    const duration = video.duration;

    if (duration <= 0) {
      return thumbnails;
    }

    // Generate 3 evenly spaced thumbnails, avoiding the first and last 10%
    const edgeBuffer = duration * 0.1;
    const usableRange = duration - 2 * edgeBuffer;
    const step = usableRange / 2; // 2 steps for 3 thumbnails

    for (let i = 0; i < 3; i++) {
      try {
        const timestamp = edgeBuffer + step * i;
        await this.seekToTime(video, timestamp);
        const thumbnail = await this.captureFrame(video, {
          ...options,
          targetWidth: options.targetWidth || 160, // Smaller for hover thumbnails
          quality: options.quality || 0.7,
        });
        thumbnails.push(thumbnail.dataUrl);
      } catch (error) {
        console.warn(`Failed to generate thumbnail ${i + 1} at ${edgeBuffer + step * i}:`, error);
        // Continue with other thumbnails even if one fails
      }
    }

    return thumbnails;
  }

  private static extractVideoMetadata(video: HTMLVideoElement, _file: File): VideoMetadata {
    return {
      duration: video.duration || 0,
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      bitrate: 0,
      codec: '',
      fps: 0,
      aspectRatio:
        video.videoWidth && video.videoHeight
          ? (video.videoWidth / video.videoHeight).toString()
          : '0',
    };
  }

  private static extractBasicMetadata(video: HTMLVideoElement): VideoMetadata {
    return {
      duration: video.duration || 0,
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      bitrate: 0,
      codec: '',
      fps: 0,
      aspectRatio:
        video.videoWidth && video.videoHeight
          ? (video.videoWidth / video.videoHeight).toString()
          : '0',
    };
  }

  // Utility method for progressive loading
  static async generateProgressiveThumbnails(
    file: File,
    options: ThumbnailGenerationOptions = {},
  ): Promise<{
    lowQuality: VideoThumbnail;
    highQuality: VideoThumbnail;
    metadata: VideoMetadata;
  }> {
    // Generate low-quality thumbnail first for immediate display
    const lowQualityOptions = {
      ...options,
      targetWidth: 160,
      quality: 0.6,
      useKeyframes: false,
      timeout: 5000,
    };

    const lowQualityResult = await this.generateEnhancedThumbnail(file, lowQualityOptions);

    // Generate high-quality thumbnail in background
    const highQualityOptions = {
      ...options,
      useKeyframes: true,
      quality: 0.9,
    };

    const highQualityResult = await this.generateEnhancedThumbnail(file, highQualityOptions);

    return {
      lowQuality: lowQualityResult.thumbnail,
      highQuality: highQualityResult.thumbnail,
      metadata: highQualityResult.metadata,
    };
  }
}
