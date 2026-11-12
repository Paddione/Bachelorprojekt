import type { Video } from '@/types/video';
import { getCategoryColorClasses } from '@/lib/category-colors';

export interface CategoryChipItem {
  type: string;
  value: string;
  color: string;
  isCustom: boolean;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '-:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
}

export function buildCategoryChips(video: Video): CategoryChipItem[] {
  const out: CategoryChipItem[] = [];
  for (const [type, values] of Object.entries(video.categories)) {
    for (const value of values) {
      out.push({ type, value, color: getCategoryColorClasses(type), isCustom: false });
    }
  }
  for (const [type, values] of Object.entries(video.customCategories)) {
    for (const value of values) {
      out.push({ type, value, color: getCategoryColorClasses(type, true), isCustom: true });
    }
  }
  return out.slice(0, 6);
}

export function chipRemovalArgs(chip: CategoryChipItem): [string, string] {
  if (chip.isCustom) return ['custom', `${chip.type}:${chip.value}`];
  return [chip.type, chip.value];
}

export const UNASSIGNED_TYPES = [
  'age',
  'physical',
  'ethnicity',
  'relationship',
  'acts',
  'setting',
  'quality',
] as const;

export const UNASSIGNED_LABELS: Record<string, string> = {
  age: 'age',
  physical: 'physical',
  ethnicity: 'ethnicity',
  relationship: 'relationship',
  acts: 'acts',
  setting: 'setting',
  quality: 'quality',
};

export function unassignedTypes(video: Video): string[] {
  return UNASSIGNED_TYPES.filter((t) => !video.categories[t]?.length);
}
