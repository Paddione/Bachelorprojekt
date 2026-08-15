import type { VideoThumbnail, VideoMetadata } from '../types/video';
import {
  EnhancedThumbnailService,
  ThumbnailGenerationOptions,
  ThumbnailResult,
} from './enhanced-thumbnail-service';
import { VideoThumbnailService } from './video-thumbnail';

interface WebCodecsSupport {
  isSupported: boolean;
  hasVideoDecoder: boolean;
  hasVideoFrame: boolean;
  hasAudioDecoder: boolean;
}

export interface WebCodecsThumbnailOptions extends ThumbnailGenerationOptions {
  extractKeyframes?: boolean;
  preferredCodec?: string;
  maxFramesToAnalyze?: number;
}

declare global {
  interface Window {
    VideoDecoder?: any;
    VideoFrame?: any;
    AudioDecoder?: any;
    EncodedVideoChunk?: any;
    EncodedAudioChunk?: any;
  }
}

export class WebCodecsThumbnailService extends EnhancedThumbnailService {
  private static webCodecsSupport: WebCodecsSupport | null = null;

  static checkWebCodecsSupport(): WebCodecsSupport {
    if (this.webCodecsSupport) return this.webCodecsSupport;

    this.webCodecsSupport = {
      isSupported: 'VideoDecoder' in window,
      hasVideoDecoder: 'VideoDecoder' in window,
      hasVideoFrame: 'VideoFrame' in window,
      hasAudioDecoder: 'AudioDecoder' in window,
    };

    return this.webCodecsSupport;
  }

  static async generateWebCodecsThumbnail(
    file: File,
    options: WebCodecsThumbnailOptions = {},
  ): Promise<ThumbnailResult> {
    const support = this.checkWebCodecsSupport();

    if (!support.isSupported) {
      console.log('WebCodecs not supported, falling back to enhanced thumbnail service');
      return this.generateEnhancedThumbnail(file, options);
    }

    try {
      return await this.processVideoWithWebCodecs(file, options);
    } catch (error) {
      console.warn('WebCodecs thumbnail generation failed, falling back:', error);
      return this.generateEnhancedThumbnail(file, options);
    }
  }

  private static async processVideoWithWebCodecs(
    file: File,
    options: WebCodecsThumbnailOptions,
  ): Promise<ThumbnailResult> {
    const { VideoDecoder, VideoFrame } = window;
    if (!VideoDecoder || !VideoFrame) {
      throw new Error('WebCodecs components not available');
    }

    return new Promise((resolve, reject) => {
      void (async () => {
        try {
          // First, get basic video information using traditional method
          const video = document.createElement('video');
          video.src = URL.createObjectURL(file);
          video.muted = true;

          await new Promise<void>((resolveLoad, rejectLoad) => {
            video.onloadedmetadata = () => resolveLoad();
            video.onerror = () => rejectLoad(new Error('Failed to load video metadata'));
            video.load();
          });

          const metadata: VideoMetadata = {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            aspectRatio: (video.videoWidth / video.videoHeight).toString(),
            bitrate: 0,
            codec: '',
            fps: 0,
          };

          URL.revokeObjectURL(video.src);

          // Use traditional method for now, as WebCodecs requires complex MP4 parsing
          // This is a placeholder for future WebCodecs implementation
          const enhancedResult = await this.generateEnhancedThumbnail(file, options);
          resolve({
            ...enhancedResult,
            metadata: { ...enhancedResult.metadata, ...metadata },
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  }

  // Future method for actual WebCodecs processing
  private static async extractKeyframesWithWebCodecs(
    file: File,
    options: WebCodecsThumbnailOptions,
  ): Promise<VideoFrame[]> {
    // This would require implementing MP4 parsing and WebCodecs decoding
    // For now, return empty array as placeholder
    return [];
  }

  // Utility to check codec support
  static async checkCodecSupport(codec: string): Promise<boolean> {
    if (!('VideoDecoder' in window)) return false;

    try {
      const support = await window.VideoDecoder.isConfigSupported({
        codec: codec,
      });
      return !!(support as { supported?: boolean })?.supported;
    } catch (error) {
      return false;
    }
  }

  // Get list of supported codecs
  static async getSupportedCodecs(): Promise<string[]> {
    const commonCodecs = [
      'avc1.42E01E', // H.264 baseline
      'avc1.4D4028', // H.264 main
      'avc1.640028', // H.264 high
      'hev1.1.6.L93.B0', // H.265
      'vp8',
      'vp09.00.10.08', // VP9
      'av01.0.04M.08', // AV1
    ];

    const supported: string[] = [];

    for (const codec of commonCodecs) {
      if (await this.checkCodecSupport(codec)) {
        supported.push(codec);
      }
    }

    return supported;
  }

  // Feature detection for better fallback decisions
  static getOptimalThumbnailMethod(): 'webcodecs' | 'enhanced' | 'basic' {
    const support = this.checkWebCodecsSupport();

    if (support.isSupported) {
      return 'webcodecs';
    } else if ('createImageBitmap' in window && 'OffscreenCanvas' in window) {
      return 'enhanced';
    } else {
      return 'basic';
    }
  }

  // Main entry point that automatically selects best method
  static async generateOptimalThumbnail(
    file: File,
    options: WebCodecsThumbnailOptions = {},
  ): Promise<ThumbnailResult> {
    const method = this.getOptimalThumbnailMethod();

    switch (method) {
      case 'webcodecs':
        return this.generateWebCodecsThumbnail(file, options);
      case 'enhanced':
        return this.generateEnhancedThumbnail(file, options);
      case 'basic':
      default:
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

  // Performance monitoring
  static async benchmarkThumbnailMethods(
    file: File,
    iterations: number = 3,
  ): Promise<{
    webcodecs: { average: number; success: boolean };
    enhanced: { average: number; success: boolean };
    basic: { average: number; success: boolean };
  }> {
    const results = {
      webcodecs: { average: 0, success: false },
      enhanced: { average: 0, success: false },
      basic: { average: 0, success: false },
    };

    // Benchmark WebCodecs
    if (this.checkWebCodecsSupport().isSupported) {
      const times: number[] = [];
      for (let i = 0; i < iterations; i++) {
        try {
          const start = performance.now();
          await this.generateWebCodecsThumbnail(file);
          times.push(performance.now() - start);
        } catch (error) {
          console.warn('WebCodecs benchmark failed:', error);
          break;
        }
      }
      if (times.length > 0) {
        results.webcodecs = {
          average: times.reduce((a, b) => a + b, 0) / times.length,
          success: true,
        };
      }
    }

    // Benchmark Enhanced
    const enhancedTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      try {
        const start = performance.now();
        await this.generateEnhancedThumbnail(file);
        enhancedTimes.push(performance.now() - start);
      } catch (error) {
        console.warn('Enhanced benchmark failed:', error);
        break;
      }
    }
    if (enhancedTimes.length > 0) {
      results.enhanced = {
        average: enhancedTimes.reduce((a, b) => a + b, 0) / enhancedTimes.length,
        success: true,
      };
    }

    // Benchmark Basic
    const basicTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      try {
        const start = performance.now();
        await VideoThumbnailService.generateThumbnail(file);
        basicTimes.push(performance.now() - start);
      } catch (error) {
        console.warn('Basic benchmark failed:', error);
        break;
      }
    }
    if (basicTimes.length > 0) {
      results.basic = {
        average: basicTimes.reduce((a, b) => a + b, 0) / basicTimes.length,
        success: true,
      };
    }

    return results;
  }
}
