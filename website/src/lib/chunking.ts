export interface ChunkOpts {
  targetTokens?: number;
  overlapTokens?: number;
  mode?: 'plain' | 'markdown';
}

export interface Chunk { position: number; text: string; }

export function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function splitOnHeadings(md: string): string[] {
  const parts: string[] = [];
  let buf = '';
  for (const line of md.split('\n')) {
    if (/^##{1,2}\s/.test(line) && buf.length > 0) {
      parts.push(buf);
      buf = '';
    }
    buf += line + '\n';
  }
  if (buf.length > 0) parts.push(buf);
  return parts;
}

function splitByTokenBudget(text: string, target: number, overlap: number): Chunk[] {
  const charPerTok = 4;
  const targetChars  = target  * charPerTok;
  const overlapChars = overlap * charPerTok;
  const out: Chunk[] = [];
  let pos = 0;
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + targetChars, text.length);
    if (end < text.length) {
      const slice = text.slice(end - 100, end);
      const idx = slice.lastIndexOf(' ');
      if (idx >= 0) end = end - 100 + idx;
    }
    out.push({ position: pos++, text: text.slice(cursor, end).trim() });
    if (end >= text.length) break;
    let nextCursor = Math.max(end - overlapChars, cursor + 1);
    // Snap to word boundary
    const wsIdx = text.indexOf(' ', nextCursor);
    if (wsIdx > nextCursor && wsIdx < end) nextCursor = wsIdx + 1;
    cursor = nextCursor;
  }
  return out;
}

export function chunkText(text: string, opts: ChunkOpts = {}): Chunk[] {
  const target  = opts.targetTokens  ?? 600;
  const overlap = opts.overlapTokens ?? 100;
  const mode    = opts.mode          ?? 'plain';

  if (approxTokens(text) <= target) {
    return [{ position: 0, text }];
  }

  if (mode === 'markdown') {
    const parts = splitOnHeadings(text);
    const out: Chunk[] = [];
    let pos = 0;
    for (const p of parts) {
      if (approxTokens(p) <= target) {
        out.push({ position: pos++, text: p.trim() });
      } else {
        for (const c of splitByTokenBudget(p, target, overlap)) {
          out.push({ position: pos++, text: c.text });
        }
      }
    }
    return out;
  }

  return splitByTokenBudget(text, target, overlap);
}
