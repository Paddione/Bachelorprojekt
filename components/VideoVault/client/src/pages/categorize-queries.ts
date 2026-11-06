import { Video } from '@/types/video';

export interface CategoryColor { bg: string; border: string; text: string; badge: string; ring: string }

export const CATEGORY_COLORS: Record<string, CategoryColor> = {
  age:          { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',   ring: '#3b82f6' },
  physical:     { bg: 'bg-pink-500/10',   border: 'border-pink-500/30',   text: 'text-pink-400',   badge: 'bg-pink-500/20 text-pink-300 border-pink-500/40',   ring: '#ec4899' },
  ethnicity:    { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', ring: '#f59e0b' },
  relationship: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40', ring: '#a855f7' },
  acts:         { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    badge: 'bg-red-500/20 text-red-300 border-red-500/40',       ring: '#ef4444' },
  setting:      { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  badge: 'bg-green-500/20 text-green-300 border-green-500/40', ring: '#22c55e' },
  quality:      { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   text: 'text-cyan-400',   badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',   ring: '#06b6d4' },
  performer:    { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40', ring: '#f97316' },
};

export const DEFAULT_COLOR: CategoryColor =
  { bg: 'bg-slate-500/10', border: 'border-slate-500/30', text: 'text-slate-400', badge: 'bg-slate-500/20 text-slate-300 border-slate-500/40', ring: '#64748b' };

export const STANDARD_TYPES = ['age', 'physical', 'ethnicity', 'relationship', 'acts', 'setting', 'quality', 'performer'];

export function colorFor(type: string): CategoryColor {
  return CATEGORY_COLORS[type] || DEFAULT_COLOR;
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export interface AvailableCategory { type: string; value: string }

export function buildAvailableByType(all: AvailableCategory[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const cat of all) {
    if (cat.value === 'unassigned') continue;
    if (!map[cat.type]) map[cat.type] = [];
    if (!map[cat.type].includes(cat.value)) map[cat.type].push(cat.value);
  }
  for (const t of STANDARD_TYPES) if (!map[t]) map[t] = [];
  return map;
}

export function buildAssignedByType(cats: Record<string, string[]> | null,
  custom: Record<string, string[]> | null): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  if (cats) for (const t of STANDARD_TYPES) map[t] = (cats[t] as string[]) || [];
  if (custom) for (const [t, values] of Object.entries(custom)) map[t] = values;
  return map;
}

export function buildAllTypes(custom: Record<string, string[]> | null,
  available: Record<string, string[]>): string[] {
  const types = new Set<string>(STANDARD_TYPES.filter((t) => t !== 'performer'));
  if (custom) Object.keys(custom).forEach((t) => types.add(t));
  Object.keys(available).forEach((t) => { if (t !== 'performer') types.add(t); });
  return Array.from(types);
}

export function collectKnownActors(videos: Video[]): string[] {
  const actors = new Set<string>();
  for (const v of videos) for (const name of v.categories.performer || []) actors.add(name);
  return Array.from(actors).sort();
}

export function completionOf(assigned: Record<string, string[]>): { filled: number; total: number } {
  const filled = STANDARD_TYPES.filter((t) => (assigned[t]?.length ?? 0) > 0).length;
  return { filled, total: STANDARD_TYPES.length };
}
