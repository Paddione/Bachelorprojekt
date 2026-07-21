import path from 'path';

export const MOVIES_DIR = process.env.MOVIES_DIR || path.join(process.cwd(), 'media', 'movies');
export const HDD_EXT_DIR = process.env.HDD_EXT_DIR || path.join(process.cwd(), 'media', 'hdd-ext');
export const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');

export function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim();
}

export function resolveAndValidateMovieDir(movieDir: string): string {
  const resolved = path.resolve(MOVIES_DIR, movieDir);
  if (!resolved.startsWith(path.resolve(MOVIES_DIR))) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}
