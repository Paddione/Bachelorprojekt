import path from 'path';
import { logger } from './logger';

export class RootsRegistry {
  private static roots = new Map<string, string>();
  private static fallbackRoot: string | null = null;

  static init(): void {
    this.roots.clear();
    this.fallbackRoot = null;

    // 1. MEDIA_ROOTS env: "movies:/mnt/movies,hdd-ext:/mnt/hdd"
    const mediaRoots = process.env.MEDIA_ROOTS;
    if (mediaRoots) {
      for (const entry of mediaRoots.split(',')) {
        const colonIdx = entry.indexOf(':');
        if (colonIdx > 0) {
          const key = entry.slice(0, colonIdx).trim();
          const absPath = entry.slice(colonIdx + 1).trim();
          if (key && absPath) {
            this.roots.set(key, absPath);
          }
        }
      }
    }

    // 2. HDD_EXT_DIR (only if not already set by MEDIA_ROOTS)
    const hddExtDir = process.env.HDD_EXT_DIR;
    if (hddExtDir && !this.roots.has('hdd-ext')) {
      this.roots.set('hdd-ext', hddExtDir);
    }

    // 3. MEDIA_ROOT as fallback for rootKey-less videos
    const mediaRoot = process.env.MEDIA_ROOT;
    if (mediaRoot) {
      this.fallbackRoot = mediaRoot;
    }

    if (this.roots.size > 0 || this.fallbackRoot) {
      logger.info('[RootsRegistry] Initialized', {
        roots: Object.fromEntries(this.roots),
        fallback: this.fallbackRoot,
      });
    }
  }

  static registerRoot(rootKey: string, absPath: string): void {
    this.roots.set(rootKey, absPath);
  }

  static resolveVideoDir(video: { rootKey?: string | null; path: string }): string | null {
    let basePath: string | null = null;

    if (video.rootKey && this.roots.has(video.rootKey)) {
      basePath = this.roots.get(video.rootKey)!;
    } else if (!video.rootKey && this.fallbackRoot) {
      basePath = this.fallbackRoot;
    }

    if (!basePath) return null;

    const videoDir = path.dirname(path.join(basePath, video.path));
    return videoDir;
  }

  static listRoots(): Record<string, string> {
    return Object.fromEntries(this.roots);
  }

  static registerFromDb(dbRoots: Array<{ rootKey: string; directories: string[] }>): void {
    for (const root of dbRoots) {
      if (!this.roots.has(root.rootKey) && root.directories.length > 0) {
        this.roots.set(root.rootKey, root.directories[0]);
      }
    }
  }

  static reset(): void {
    this.roots.clear();
    this.fallbackRoot = null;
  }
}
