import type { VideoThumbnail, VideoMetadata } from '../types/video';
import { encodeImageBitmapInWorker, supportsThumbnailWorker } from './thumbnail-worker-bridge';
import { thumbnailCache } from './thumbnail-cache';

export class ThumbnailGenerators {
  private static canvas: HTMLCanvasElement | null = null;
  private static context: CanvasRenderingContext2D | null = null;
  private static readonly TIMEOUT_MS = 8000;

  static async generateThumbnail(file: File): Promise<VideoThumbnail> {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);

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

        let resolved = false;
        const resolveSafe = (result: VideoThumbnail) => {
          resolved = true;
          clearTimeout(timeoutId);
          cleanup();
          resolve(result);
        };

        const timeoutId = window.setTimeout(() => {
          console.warn('Thumbnail generation timed out, using placeholder:', file.name);
          resolveSafe(thumbnailCache.generatePlaceholderThumbnail(file.name));
        }, this.TIMEOUT_MS);

        const performCapture = async () => {
          if (resolved) return;

          try {
            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
              return resolveSafe(thumbnailCache.generatePlaceholderThumbnail(file.name));
            }

            const canUseWorker = supportsThumbnailWorker() && 'createImageBitmap' in window;
            if (canUseWorker) {
              try {
                const aspectRatio =
                  video.videoWidth > 0 && video.videoHeight > 0
                    ? video.videoWidth / video.videoHeight
                    : 16 / 9;
                const targetWidth = 320;
                const targetHeight = Math.max(1, Math.round(targetWidth / aspectRatio));

                const captureCanvas = document.createElement('canvas');
                captureCanvas.width = targetWidth;
                captureCanvas.height = targetHeight;
                const captureCtx = captureCanvas.getContext('2d');
                if (!captureCtx) throw new Error('Failed to acquire canvas context for capture');
                captureCtx.drawImage(video, 0, 0, targetWidth, targetHeight);

                const bitmap = await createImageBitmap(captureCanvas);
                const dataUrl = await encodeImageBitmapInWorker(
                  bitmap,
                  targetWidth,
                  targetHeight,
                  0.8,
                );
                bitmap.close();
                return resolveSafe({
                  dataUrl,
                  generated: true,
                  timestamp: new Date().toISOString(),
                });
              } catch (e) {
                console.warn('Worker thumbnail encode failed, falling back to canvas:', e);
              }
            }

            if (!this.canvas) {
              this.canvas = document.createElement('canvas');
              this.context = this.canvas.getContext('2d');
            }

            if (this.canvas && this.context) {
              const aspectRatio =
                video.videoWidth > 0 && video.videoHeight > 0
                  ? video.videoWidth / video.videoHeight
                  : 16 / 9;
              this.canvas.width = 320;
              this.canvas.height = Math.max(1, Math.round(320 / aspectRatio));

              this.context.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
              const dataUrl = this.canvas.toDataURL('image/jpeg', 0.8);

              resolveSafe({
                dataUrl,
                generated: true,
                timestamp: new Date().toISOString(),
              });
            } else {
              resolveSafe(thumbnailCache.generatePlaceholderThumbnail(file.name));
            }
          } catch (error) {
            console.warn('Thumbnail capture failed:', error);
            resolveSafe(thumbnailCache.generatePlaceholderThumbnail(file.name));
          }
        };

        video.onloadedmetadata = () => {
          if (resolved) return;

          const duration = Number.isFinite(video.duration) ? video.duration : 0;
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
              performCapture().catch((error) => {
                console.warn('Thumbnail capture failed in onloadedmetadata:', error);
                if (!resolved) resolveSafe(thumbnailCache.generatePlaceholderThumbnail(file.name));
              });
            }
          } catch (_e) {
            if (!resolved) resolveSafe(thumbnailCache.generatePlaceholderThumbnail(file.name));
          }
        };

        video.onloadeddata = () => {
          if (!resolved) {
            performCapture().catch((error) => {
              console.warn('Thumbnail capture failed in onloadeddata:', error);
              if (!resolved) resolveSafe(thumbnailCache.generatePlaceholderThumbnail(file.name));
            });
          }
        };

        video.onseeked = async () => {
          if (resolved) return;
          try {
            await performCapture();
          } catch (error) {
            console.warn('Thumbnail capture failed in onseeked:', error);
            if (!resolved) resolveSafe(thumbnailCache.generatePlaceholderThumbnail(file.name));
          }
        };

        video.onerror = () => {
          resolveSafe(thumbnailCache.generatePlaceholderThumbnail(file.name));
        };

        video.src = objectUrl;
      });
    } catch (error) {
      console.warn('Failed to generate thumbnail:', error);
      return thumbnailCache.generatePlaceholderThumbnail(file.name);
    }
  }

  static async extractVideoMetadata(file: File): Promise<VideoMetadata> {
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;

      return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);

        const cleanup = () => {
          video.pause();
          video.removeAttribute('src');
          video.load();
          URL.revokeObjectURL(objectUrl);
          video.onloadedmetadata = null;
          video.onerror = null;
        };

        const resolveSafe = (metadata: VideoMetadata) => {
          clearTimeout(timeoutId);
          cleanup();
          resolve(metadata);
        };

        const timeoutId = window.setTimeout(() => {
          console.warn('Metadata extraction timed out, using fallback:', file.name);
          resolveSafe({
            duration: 0,
            width: 1920,
            height: 1080,
            bitrate: 0,
            codec: 'Unknown',
            fps: 30,
            aspectRatio: '16:9',
          });
        }, this.TIMEOUT_MS);

        video.onloadedmetadata = () => {
          const metadata: VideoMetadata = {
            duration: Number.isFinite(video.duration) ? Math.round(video.duration) : 0,
            width: video.videoWidth || 1920,
            height: video.videoHeight || 1080,
            bitrate: this.calculateBitrate(file.size, video.duration || 0),
            codec: this.detectCodec(file.type),
            fps: 30,
            aspectRatio: this.calculateAspectRatio(
              video.videoWidth || 1920,
              video.videoHeight || 1080,
            ),
          };
          resolveSafe(metadata);
        };

        video.onerror = () => {
          resolveSafe({
            duration: 0,
            width: 1920,
            height: 1080,
            bitrate: 0,
            codec: 'Unknown',
            fps: 30,
            aspectRatio: '16:9',
          });
        };

        video.src = objectUrl;
      });
    } catch (error) {
      console.warn('Failed to extract metadata:', error);
      return {
        duration: 0,
        width: 1920,
        height: 1080,
        bitrate: 0,
        codec: 'Unknown',
        fps: 30,
        aspectRatio: '16:9',
      };
    }
  }

  private static calculateBitrate(fileSize: number, duration: number): number {
    if (duration === 0) return 0;
    return Math.round((fileSize * 8) / (duration * 1000));
  }

  private static detectCodec(mimeType: string): string {
    if (mimeType.includes('h264') || mimeType.includes('avc')) return 'H.264/AVC';
    if (mimeType.includes('h265') || mimeType.includes('hevc')) return 'H.265/HEVC';
    if (mimeType.includes('vp8')) return 'VP8';
    if (mimeType.includes('vp9')) return 'VP9';
    if (mimeType.includes('av1')) return 'AV1';
    return 'Unknown';
  }

  private static calculateAspectRatio(width: number, height: number): string {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
  }

  static async captureFrameAtTime(
    sourceUrl: string,
    timeSeconds: number,
    targetWidth = 160,
    quality = 0.8,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      try {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.crossOrigin = 'anonymous';

        let didFinish = false;
        const cleanup = () => {
          video.pause();
          video.removeAttribute('src');
          video.load();
          video.onloadedmetadata = null;
          video.onloadeddata = null;
          (video as any).onseeked = null;
          video.onerror = null;
        };

        const finish = (dataUrl: string) => {
          if (didFinish) return;
          didFinish = true;
          clearTimeout(timeoutId);
          cleanup();
          resolve(dataUrl);
        };
        const fail = (err: any) => {
          if (didFinish) return;
          didFinish = true;
          clearTimeout(timeoutId);
          cleanup();
          reject(err);
        };

        const timeoutId = window.setTimeout(
          () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = targetWidth;
              canvas.height = Math.max(1, Math.round((targetWidth * 9) / 16));
              finish(canvas.toDataURL('image/jpeg', quality));
            } catch (e) {
              fail(e);
            }
          },
          Math.min(this.TIMEOUT_MS, 2000),
        );

        const performCaptureAtCurrent = async () => {
          if (didFinish) return;

          try {
            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
              const canvas = document.createElement('canvas');
              canvas.width = targetWidth;
              canvas.height = Math.max(1, Math.round((targetWidth * 9) / 16));
              return finish(canvas.toDataURL('image/jpeg', quality));
            }

            const aspectRatio =
              video.videoWidth > 0 && video.videoHeight > 0
                ? video.videoWidth / video.videoHeight
                : 16 / 9;
            const targetHeight = Math.max(1, Math.round(targetWidth / aspectRatio));

            if ('createImageBitmap' in window && supportsThumbnailWorker()) {
              try {
                const captureCanvas = document.createElement('canvas');
                captureCanvas.width = targetWidth;
                captureCanvas.height = targetHeight;
                const captureCtx = captureCanvas.getContext('2d');
                if (!captureCtx) throw new Error('Failed to acquire canvas context for capture');
                captureCtx.drawImage(video, 0, 0, targetWidth, targetHeight);
                const bitmap = await createImageBitmap(captureCanvas);
                const dataUrl = await encodeImageBitmapInWorker(
                  bitmap,
                  targetWidth,
                  targetHeight,
                  quality,
                );
                bitmap.close();
                return finish(dataUrl);
              } catch (_e) {}
            }

            if (!this.canvas) {
              this.canvas = document.createElement('canvas');
              this.context = this.canvas.getContext('2d');
            }
            if (!this.canvas || !this.context) {
              const canvas = document.createElement('canvas');
              canvas.width = targetWidth;
              canvas.height = targetHeight;
              return finish(canvas.toDataURL('image/jpeg', quality));
            }

            this.canvas.width = targetWidth;
            this.canvas.height = targetHeight;
            this.context.drawImage(video, 0, 0, targetWidth, targetHeight);
            const dataUrl = this.canvas.toDataURL('image/jpeg', quality);
            return finish(dataUrl);
          } catch (e) {
            console.warn('Frame capture failed:', e);
            fail(e);
          }
        };

        video.onloadedmetadata = async () => {
          if (didFinish) return;

          try {
            const clamped = Math.max(
              0,
              Math.min(Number.isFinite(video.duration) ? video.duration : timeSeconds, timeSeconds),
            );
            if (clamped > 0 && clamped !== video.currentTime) {
              video.currentTime = clamped;
            } else {
              await performCaptureAtCurrent();
            }
          } catch (e) {
            console.warn('Frame capture failed in onloadedmetadata:', e);
            if (!didFinish) fail(e);
          }
        };

        (video as any).onseeked = async () => {
          if (didFinish) return;
          try {
            await performCaptureAtCurrent();
          } catch (error) {
            console.warn('Frame capture failed in onseeked:', error);
            if (!didFinish) fail(error);
          }
        };

        video.onloadeddata = () => {
          if (!didFinish && video.currentTime === 0) {
            performCaptureAtCurrent().catch((error) => {
              console.warn('Frame capture failed in onloadeddata:', error);
              if (!didFinish) fail(error);
            });
          }
        };

        video.onerror = () => fail(new Error('Failed to load video for frame capture'));

        video.src = sourceUrl;
      } catch (error) {
        reject(error);
      }
    });
  }

  static async waitForDecodableFrame(video: HTMLVideoElement, timeoutMs = 1500): Promise<void> {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('waitForDecodableFrame timeout'));
      }, timeoutMs);

      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadeddata', onLoadedData);
        video.removeEventListener('canplay', onCanPlay);
      };

      const onLoadedData = () => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          cleanup();
          resolve();
        }
      };

      const onCanPlay = () => {
        cleanup();
        resolve();
      };

      video.addEventListener('loadeddata', onLoadedData);
      video.addEventListener('canplay', onCanPlay);

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        cleanup();
        resolve();
      }
    });
  }
}
