export const SURFACE = '#141414';
export const BORDER = '#2a2a2a';
export const TEXT_MUTED = '#737373';
export const ACCENT = '#f59e0b';
export const SUCCESS = '#10b981';

const HEATMAP_MIN = '#1a2634';
const HEATMAP_MAX = '#f59e0b';

export const PHASE_COLORS: string[] = [
  '#3b82f6',
  '#8b5cf6',
  '#f59e0b',
  '#06b6d4',
  '#10b981',
  '#ef4444',
];

export const PHASE_LABELS = ['scout', 'design', 'plan', 'implement', 'verify', 'deploy'];
export const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

function interpolateColor(min: string, max: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = hexToRgb(min);
  const [r2, g2, b2] = hexToRgb(max);
  return rgbToHex(r1 + (r2 - r1) * clamped, g1 + (g2 - g1) * clamped, b1 + (b2 - b1) * clamped);
}

export function heatmapColor(value: number, max: number): string {
  if (max <= 0) return HEATMAP_MIN;
  return interpolateColor(HEATMAP_MIN, HEATMAP_MAX, value / max);
}
