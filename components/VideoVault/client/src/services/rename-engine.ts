import { Video } from '@/types/video';

export interface BatchRenameOptions {
  prefix?: string;
  suffix?: string;
  startIndex?: number;
  padDigits?: number;
  transform?: 'none' | 'lower' | 'upper' | 'title';
  applyTo?: 'displayName' | 'filename' | 'both';
}

export function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function applyTransform(input: string, transform: BatchRenameOptions['transform']): string {
  switch (transform) {
    case 'lower':
      return input.toLowerCase();
    case 'upper':
      return input.toUpperCase();
    case 'title':
      return toTitleCase(input);
    default:
      return input;
  }
}

export function buildBatchName(video: Video, index: number, options: BatchRenameOptions): string {
  const startIndex = options.startIndex ?? 1;
  const padDigits = options.padDigits ?? 2;
  const numberStr = String(startIndex + index).padStart(padDigits, '0');

  const base = video.displayName;
  const raw = `${options.prefix ?? ''}${base}${options.suffix ?? ''} ${numberStr}`.trim();
  return applyTransform(raw, options.transform ?? 'none');
}

export function getFilenameWithOriginalExt(baseName: string, originalFilename: string): string {
  const extMatch = originalFilename.match(/\.[^./\\]+$/);
  const ext = extMatch ? extMatch[0] : '';
  return `${baseName}${ext}`;
}

// Generate a safe base name string for files/display names
export function sanitizeBaseName(input: string): string {
  const replacedSpaces = (input || '').trim().replace(/\s+/g, '_');
  // Remove characters generally invalid in filenames across platforms
  const strippedInvalid = replacedSpaces.replace(/[\\/:*?"<>|]+/g, '');
  // Collapse multiple underscores and trim leading/trailing underscores
  return strippedInvalid.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

// Build a base name by concatenating categories with underscores.
// If a performer name appears in the display title, put that performer first.
export function buildNameFromCategories(video: Video): string {
  const parts: string[] = [];
  const seen = new Set<string>();

  const addPart = (p: string) => {
    const s = sanitizeBaseName(p.toLowerCase());
    if (!s) return;
    if (seen.has(s)) return;
    seen.add(s);
    parts.push(s);
  };

  const displayLower = (video.displayName || '').toLowerCase();
  const performer = (video.categories?.performer || []).filter(Boolean);
  const performersInTitle: string[] = [];
  const otherPerformers: string[] = [];
  for (const p of performer) {
    if (displayLower.includes((p || '').toLowerCase())) performersInTitle.push(p);
    else otherPerformers.push(p);
  }
  performersInTitle.forEach(addPart);
  otherPerformers.forEach(addPart);

  const orderedStandardKeys: Array<keyof Video['categories']> = [
    'age',
    'physical',
    'ethnicity',
    'relationship',
    'acts',
    'setting',
    'quality',
    // 'performer' intentionally handled first
  ];
  for (const key of orderedStandardKeys) {
    const values = video.categories?.[key] || [];
    for (const v of values) addPart(v);
  }

  // Append custom categories as `${type}-${value}` for clarity
  const custom = video.customCategories || {};
  Object.entries(custom).forEach(([type, values]) => {
    (values || []).forEach((v) => addPart(`${type}-${v}`));
  });

  if (parts.length === 0) {
    // Fallback to a sanitized version of the display name (or filename base)
    const base = video.displayName || video.filename.replace(/\.[^./\\]+$/, '');
    return sanitizeBaseName(base);
  }

  return sanitizeBaseName(parts.join('_'));
}
