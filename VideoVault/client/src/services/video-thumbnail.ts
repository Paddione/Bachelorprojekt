import type { VideoThumbnail, VideoMetadata } from '../types/video';
import { encodeImageBitmapInWorker, supportsThumbnailWorker } from './thumbnail-worker-bridge';
import { DirectoryHandleRegistry } from './directory-handle-registry';

export class VideoThumbnailService {
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
          resolveSafe(this.generatePlaceholderThumbnail(file.name));
        }, this.TIMEOUT_MS);

        const performCapture = async () => {
          if (resolved) return; // Early exit if already resolved

          try {
            // Check if video is ready for capture
            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
              // Video not ready, skip waitForDecodableFrame and use placeholder
              return resolveSafe(this.generatePlaceholderThumbnail(file.name));
            }

            // Prefer worker + ImageBitmap pipeline when supported
            const canUseWorker = supportsThumbnailWorker() && 'createImageBitmap' in window;
            if (canUseWorker) {
              try {
                const aspectRatio =
                  video.videoWidth > 0 && video.videoHeight > 0
                    ? video.videoWidth / video.videoHeight
                    : 16 / 9;
                const targetWidth = 320;
                const targetHeight = Math.max(1, Math.round(targetWidth / aspectRatio));

                // Draw the current frame onto a canvas first to avoid createImageBitmap(video) INVALID_STATE errors
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
                bitmap.close(); // Clean up bitmap
                return resolveSafe({
                  dataUrl,
                  generated: true,
                  timestamp: new Date().toISOString(),
                });
              } catch (e) {
                console.warn('Worker thumbnail encode failed, falling back to canvas:', e);
                // fall through to canvas path
              }
            }

            // Canvas fallback path
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
              resolveSafe(this.generatePlaceholderThumbnail(file.name));
            }
          } catch (error) {
            console.warn('Thumbnail capture failed:', error);
            resolveSafe(this.generatePlaceholderThumbnail(file.name));
          }
        };

        video.onloadedmetadata = () => {
          if (resolved) return; // Early exit if already resolved

          const duration = Number.isFinite(video.duration) ? video.duration : 0;
          // Aim for the midpoint, but avoid the first/last few frames to reduce black frames
          const minEdgeOffset = duration > 0 ? Math.min(1, Math.max(0.1, duration * 0.05)) : 0; // up to 1s, at least 5% when long
          const midpoint = duration > 0 ? duration * 0.5 : 0;
          const target =
            duration > 0
              ? Math.max(minEdgeOffset, Math.min(midpoint, Math.max(0, duration - minEdgeOffset)))
              : 0;
          try {
            if (target > 0 && target !== video.currentTime) {
              video.currentTime = Math.max(0, Math.min(target, video.duration || 0));
            } else {
              // Seeking to 0 often does not fire 'seeked'; capture once data is available
              performCapture().catch((error) => {
                console.warn('Thumbnail capture failed in onloadedmetadata:', error);
                if (!resolved) resolveSafe(this.generatePlaceholderThumbnail(file.name));
              });
            }
          } catch (_e) {
            // If seeking fails, resolve with placeholder
            if (!resolved) resolveSafe(this.generatePlaceholderThumbnail(file.name));
          }
        };

        video.onloadeddata = () => {
          // Fallback in case 'seeked' never fires (e.g., seek to 0)
          if (!resolved) {
            performCapture().catch((error) => {
              console.warn('Thumbnail capture failed in onloadeddata:', error);
              if (!resolved) resolveSafe(this.generatePlaceholderThumbnail(file.name));
            });
          }
        };

        video.onseeked = async () => {
          if (resolved) return;
          try {
            await performCapture();
          } catch (error) {
            console.warn('Thumbnail capture failed in onseeked:', error);
            if (!resolved) resolveSafe(this.generatePlaceholderThumbnail(file.name));
          }
        };

        video.onerror = () => {
          resolveSafe(this.generatePlaceholderThumbnail(file.name));
        };

        video.src = objectUrl;
      });
    } catch (error) {
      console.warn('Failed to generate thumbnail:', error);
      return this.generatePlaceholderThumbnail(file.name);
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
    // Convert to kbps
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

  static generatePlaceholderThumbnail(filename: string): VideoThumbnail {
    // Create a simple gradient placeholder
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Create gradient background
      const gradient = ctx.createLinearGradient(0, 0, 320, 180);
      gradient.addColorStop(0, '#f3f4f6');
      gradient.addColorStop(1, '#e5e7eb');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 320, 180);

      // Add video icon
      ctx.fillStyle = '#9ca3af';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🎬', 160, 100);

      // Add filename excerpt
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      const displayName = filename.length > 25 ? filename.substring(0, 25) + '...' : filename;
      ctx.fillText(displayName, 160, 140);
    }

    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.8),
      generated: false,
      timestamp: new Date().toISOString(),
    };
  }

  // Attempt to read an existing thumbnail from the same directory as the video file,
  // or from a sibling 'thumbnails' or 'Thumbnails' directory.
  // Prefers <basename>-thumb.jpg (server generated), then falls back to -2.jpg, -1.jpg, etc.
  static async tryReadExternalThumbnail(
    parentDirHandle: FileSystemDirectoryHandle,
    filename: string,
  ): Promise<VideoThumbnail | null> {
    try {
      const base = filename.replace(/\.[^.]+$/, '');
      console.log(`[Thumbnail] Looking for thumbnails for: ${filename} (base: ${base})`);

      // First, check for thumbnails in the SAME directory as the video file
      // Support both underscore and hyphen separators
      const sameDirCandidates = [
        `${base}_thumb.jpg`, // Underscore variant (your naming convention)
        `${base}-thumb.jpg`, // Hyphen variant (server generated)
        `${base}_2.jpg`,
        `${base}-2.jpg`,
        `${base}_1.jpg`,
        `${base}-1.jpg`,
        `${base}_3.jpg`,
        `${base}-3.jpg`,
        `${base}_2.png`,
        `${base}-2.png`,
        `${base}_1.png`,
        `${base}-1.png`,
        `${base}_3.png`,
        `${base}-3.png`,
      ];

      for (const name of sameDirCandidates) {
        try {
          const fh = await (parentDirHandle as any).getFileHandle?.(name, { create: false });
          if (fh) {
            console.log(`[Thumbnail] ✓ Found thumbnail: ${name}`);
            const file: File = await fh.getFile();
            const dataUrl = await this.readFileAsDataUrl(file);
            return {
              dataUrl,
              generated: true,
              timestamp: new Date().toISOString(),
            };
          }
        } catch (_e) {
          // try next candidate
        }
      }

      // Fallback: Check 'Thumbnails' subdirectory (server generated)
      try {
        const thumbsDir = await (parentDirHandle as any).getDirectoryHandle?.('Thumbnails', {
          create: false,
        });
        if (thumbsDir) {
          const thumbCandidates = [`${base}_thumb.jpg`, `${base}-thumb.jpg`];
          for (const name of thumbCandidates) {
            const fh = await thumbsDir.getFileHandle?.(name, { create: false });
            if (fh) {
              const file: File = await fh.getFile();
              const dataUrl = await this.readFileAsDataUrl(file);
              return {
                dataUrl,
                generated: true,
                timestamp: new Date().toISOString(),
              };
            }
          }
        }
      } catch (_e) {
        // ignore
      }

      // Fallback: Check 'thumbnails' subdirectory (lowercase)
      const subdirCandidates = [
        `${base}-2.jpg`,
        `${base}-1.jpg`,
        `${base}-3.jpg`,
        `${base}-2.png`,
        `${base}-1.png`,
        `${base}-3.png`,
      ];

      try {
        const thumbnailsDir = await (parentDirHandle as any).getDirectoryHandle?.('thumbnails', {
          create: false,
        });
        if (thumbnailsDir) {
          for (const name of subdirCandidates) {
            try {
              const fh = await thumbnailsDir.getFileHandle?.(name, { create: false });
              if (fh) {
                const file: File = await fh.getFile();
                const dataUrl = await this.readFileAsDataUrl(file);
                return {
                  dataUrl,
                  generated: true,
                  timestamp: new Date().toISOString(),
                };
              }
            } catch (_e) {
              // try next candidate
            }
          }
        }
      } catch (_e) {
        // ignore
      }

      return null;
    } catch (_e) {
      return null;
    }
  }

  // Attempt to read an existing sprite sheet from the same directory as the video file
  static async tryReadExternalSprite(
    parentDirHandle: FileSystemDirectoryHandle,
    filename: string,
  ): Promise<string | null> {
    try {
      const base = filename.replace(/\.[^.]+$/, '');

      // Support both underscore and hyphen separators
      const candidates = [
        `${base}_sprite.jpg`,
        `${base}-sprite.jpg`,
        `${base}_sprite.png`,
        `${base}-sprite.png`,
      ];

      for (const name of candidates) {
        try {
          const fh = await (parentDirHandle as any).getFileHandle?.(name, { create: false });
          if (fh) {
            console.log(`[Sprite] ✓ Found sprite sheet: ${name}`);
            const file: File = await fh.getFile();
            return await this.readFileAsDataUrl(file);
          }
        } catch (_e) {
          // try next candidate
        }
      }

      // Fallback: Check 'Thumbnails' subdirectory (server generated)
      try {
        const thumbsDir = await (parentDirHandle as any).getDirectoryHandle?.('Thumbnails', {
          create: false,
        });
        if (thumbsDir) {
          for (const name of candidates) {
            try {
              const fh = await thumbsDir.getFileHandle?.(name, { create: false });
              if (fh) {
                const file: File = await fh.getFile();
                return await this.readFileAsDataUrl(file);
              }
            } catch (_e) {
              // try next candidate
            }
          }
        }
      } catch (_e) {
        // ignore
      }

      return null;
    } catch (_e) {
      return null;
    }
  }

  // Load all available external thumbnails (-1/-2/-3 .jpg/.png) for a given video id
  static async tryReadExternalThumbnailsForVideo(
    videoId: string,
    filename: string,
  ): Promise<string[]> {
    try {
      const info = DirectoryHandleRegistry.getParentForFile(videoId);
      if (!info) return [];
      const base = filename.replace(/\.[^.]+$/, '');
      // Support both underscore and hyphen separators
      const names = [
        `${base}_1.jpg`,
        `${base}-1.jpg`,
        `${base}_2.jpg`,
        `${base}-2.jpg`,
        `${base}_3.jpg`,
        `${base}-3.jpg`,
        `${base}_1.png`,
        `${base}-1.png`,
        `${base}_2.png`,
        `${base}-2.png`,
        `${base}_3.png`,
        `${base}-3.png`,
      ];

      const out: string[] = [];

      // First, check for thumbnails in the SAME directory as the video file
      for (const n of names) {
        try {
          const fh = await (info.parent as any).getFileHandle?.(n, { create: false });
          if (fh) {
            const file: File = await fh.getFile();
            const dataUrl = await this.readFileAsDataUrl(file);
            out.push(dataUrl);
          }
        } catch (_e) {
          // ignore missing
        }
      }

      // If we found thumbnails in the same directory, return them
      if (out.length > 0) return out;

      // Fallback: check thumbnails subdirectory
      try {
        const thumbDirs = ['Thumbnails', 'thumbnails'];
        for (const dirName of thumbDirs) {
          const thumbsDir = await (info.parent as any).getDirectoryHandle?.(dirName, {
            create: false,
          });
          if (!thumbsDir) continue;
          for (const n of names) {
            try {
              const fh = await thumbsDir.getFileHandle?.(n, { create: false });
              if (fh) {
                const file: File = await fh.getFile();
                const dataUrl = await this.readFileAsDataUrl(file);
                out.push(dataUrl);
              }
            } catch (_e) {
              // ignore missing
            }
          }
          if (out.length > 0) break;
        }
      } catch (_e) {
        // ignore
      }

      return out;
    } catch (_e) {
      return [];
    }
  }

  private static readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read file as data URL'));
        reader.readAsDataURL(file);
      } catch (e) {
        reject(e);
      }
    });
  }

  static determineQuality(width: number, height: number): string {
    if (width >= 3840 && height >= 2160) return '4K';
    if (width >= 1920 && height >= 1080) return 'HD';
    if (width >= 1280 && height >= 720) return '720p';
    if (width >= 854 && height >= 480) return '480p';
    return 'SD';
  }

  // New: capture an arbitrary frame from a source URL at a time (seconds)
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
          // Avoid revoking since sourceUrl is managed by VideoUrlRegistry
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
            // Return a transparent image to avoid UI stalls
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
          if (didFinish) return; // Early exit if already finished

          try {
            // Check if video is ready for capture
            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
              // Video not ready, return a placeholder canvas
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
                // Avoid createImageBitmap(video) due to potential INVALID_STATE; draw to canvas first
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
                bitmap.close(); // Clean up bitmap
                return finish(dataUrl);
              } catch (_e) {
                // fall through
              }
            }

            // Canvas fallback
            if (!this.canvas) {
              this.canvas = document.createElement('canvas');
              this.context = this.canvas.getContext('2d');
            }
            if (!this.canvas || !this.context) {
              // As a last resort
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
          if (didFinish) return; // Early exit if already finished

          try {
            const clamped = Math.max(
              0,
              Math.min(Number.isFinite(video.duration) ? video.duration : timeSeconds, timeSeconds),
            );
            if (clamped > 0 && clamped !== video.currentTime) {
              video.currentTime = clamped;
            } else {
              // No seek needed, capture when data is available
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
    // Check if video already has decodable frames
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

      // Listen for multiple events to ensure we catch the ready state
      video.addEventListener('loadeddata', onLoadedData);
      video.addEventListener('canplay', onCanPlay);

      // Check again in case the state changed during setup
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        cleanup();
        resolve();
      }
    });
  }
}
