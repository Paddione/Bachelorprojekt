import type { Video } from '@/types/video';

export interface BrowseEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  servePath?: string;
  isVideo?: boolean;
}

export interface BrowseResponse {
  path: string;
  entries: BrowseEntry[];
}

export function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function toPlayerVideo(entry: BrowseEntry): Video | null {
  if (!entry.servePath) return null;
  return {
    id: entry.servePath,
    filename: entry.name,
    displayName: entry.name.replace(/\.[^.]+$/, ''),
    path: entry.servePath,
    size: entry.size || 0,
    lastModified: entry.modified || new Date().toISOString(),
    categories: { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] },
    customCategories: {},
    metadata: { duration: 0, width: 0, height: 0, bitrate: 0, codec: '', fps: 0, aspectRatio: '' },
  };
}

export function pathPartsOf(path: string): string[] {
  return path.split('/').filter(Boolean);
}

export function childPath(current: string, name: string): string {
  return current ? `${current}/${name}` : name;
}

export function parentPath(current: string): string {
  const parts = pathPartsOf(current);
  parts.pop();
  return parts.join('/');
}

export function breadcrumbPath(current: string, index: number): string {
  return pathPartsOf(current).slice(0, index + 1).join('/');
}
