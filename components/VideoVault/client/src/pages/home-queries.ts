import { ConflictStrategy, ConflictItem } from '@/components/conflict/conflict-resolution-dialog';
import type { AdvancedFilters } from '@/types/video';

export type ConflictDialogState = {
  operation: 'rename' | 'batch-rename' | 'move' | 'batch-move';
  items: ConflictItem[];
  applyTo?: 'displayName' | 'filename' | 'both';
  desiredBaseById?: Record<string, string>;
  targetDir?: string;
};

export interface BatchResult {
  success: number;
  failed: number;
  results?: Array<{ id: string; success: boolean; code?: string; error?: string }>;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface FilterCounts {
  selectedCategories: unknown[];
  searchQuery: string;
  dateRange: { startDate: string; endDate: string };
  fileSizeRange: { min: number; max: number };
  durationRange: { min: number; max: number };
}

export function activeFilterCount(s: FilterCounts): number {
  return s.selectedCategories.length
    + (s.searchQuery.trim() ? 1 : 0)
    + (s.dateRange.startDate || s.dateRange.endDate ? 1 : 0)
    + (s.fileSizeRange.min > 0 || s.fileSizeRange.max > 0 ? 1 : 0)
    + (s.durationRange.min > 0 || s.durationRange.max > 0 ? 1 : 0);
}

export function buildAdvancedFilters(s: FilterCounts): AdvancedFilters {
  return { dateRange: s.dateRange, fileSizeRange: s.fileSizeRange, durationRange: s.durationRange };
}

export type ResolveDecisions = Record<string, ConflictStrategy>;
