import type { VideoThumbnail } from '../types/video';
import { DirectoryHandleRegistry } from './directory-handle-registry';

export class ThumbnailCache {
  generatePlaceholderThumbnail(filename: string): VideoThumbnail {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 320, 180);
      gradient.addColorStop(0, '#f3f4f6');
      gradient.addColorStop(1, '#e5e7eb');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 320, 180);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🎬', 160, 100);

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

  async tryReadExternalThumbnail(
    parentDirHandle: FileSystemDirectoryHandle,
    filename: string,
  ): Promise<VideoThumbnail | null> {
    try {
      const base = filename.replace(/\.[^.]+$/, '');
      console.log(`[Thumbnail] Looking for thumbnails for: ${filename} (base: ${base})`);

      const sameDirCandidates = [
        `${base}_thumb.jpg`,
        `${base}-thumb.jpg`,
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
        } catch (_e) {}
      }

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
      } catch (_e) {}

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
            } catch (_e) {}
          }
        }
      } catch (_e) {}

      return null;
    } catch (_e) {
      return null;
    }
  }

  async tryReadExternalSprite(
    parentDirHandle: FileSystemDirectoryHandle,
    filename: string,
  ): Promise<string | null> {
    try {
      const base = filename.replace(/\.[^.]+$/, '');
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
        } catch (_e) {}
      }

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
            } catch (_e) {}
          }
        }
      } catch (_e) {}

      return null;
    } catch (_e) {
      return null;
    }
  }

  async tryReadExternalThumbnailsForVideo(
    videoId: string,
    filename: string,
  ): Promise<string[]> {
    try {
      const info = DirectoryHandleRegistry.getParentForFile(videoId);
      if (!info) return [];
      const base = filename.replace(/\.[^.]+$/, '');
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

      for (const n of names) {
        try {
          const fh = await (info.parent as any).getFileHandle?.(n, { create: false });
          if (fh) {
            const file: File = await fh.getFile();
            const dataUrl = await this.readFileAsDataUrl(file);
            out.push(dataUrl);
          }
        } catch (_e) {}
      }

      if (out.length > 0) return out;

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
            } catch (_e) {}
          }
          if (out.length > 0) break;
        }
      } catch (_e) {}

      return out;
    } catch (_e) {
      return [];
    }
  }

  readFileAsDataUrl(file: File): Promise<string> {
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

  determineQuality(width: number, height: number): string {
    if (width >= 3840 && height >= 2160) return '4K';
    if (width >= 1920 && height >= 1080) return 'HD';
    if (width >= 1280 && height >= 720) return '720p';
    if (width >= 854 && height >= 480) return '480p';
    return 'SD';
  }
}

export const thumbnailCache = new ThumbnailCache();
