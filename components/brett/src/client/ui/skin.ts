// brett/src/client/ui/skin.ts — Phase E / E1 + E3
//
// Pure token-resolution helpers for canvas/SVG contexts that cannot use CSS
// `var()` natively. DOM access is confined to the (optional) browser-side
// resolver injected by callers; this module is importable under node/tsx.
//
// Token names reference `brett/public/assets/figure-pack/colors_and_type.css`
// (the SSOT for board-side tokens). Fallbacks equal the current literals so the
// look degrades gracefully when the CSS file is not yet linked.

export type VarGetter = (name: string) => string;

/**
 * Resolves a CSS custom property value.
 *
 * - Without `getVar`: returns the fallback (pure / no DOM).
 * - With `getVar`: calls it, trims whitespace; returns the fallback if the
 *   result is empty (property not set).
 */
export function resolveToken(name: string, fallback: string, getVar?: VarGetter): string {
  if (!getVar) return fallback;
  const v = getVar(name)?.trim();
  return v || fallback;
}

export interface BadgeStyle {
  bg: string;
  text: string;
  font: string;
}

/**
 * Returns canvas 2D style values for a figure-lock badge bubble.
 *
 * @param color  Explicit participant color (takes precedence over the brass
 *               token when non-empty). Pass `undefined` / empty string to use
 *               the token default.
 * @param getVar Optional CSS-variable resolver (e.g. `getComputedStyle`-based).
 *               Omit in unit tests / non-DOM contexts.
 */
export function lockBadgeStyle(color?: string, getVar?: VarGetter): BadgeStyle {
  return {
    bg:   color || resolveToken('--brass', '#c8a96e', getVar),
    text: resolveToken('--slate-0', '#0e1014', getVar),
    font: `bold 24px ${resolveToken('--font-sans', 'system-ui, sans-serif', getVar)}`,
  };
}

// ── Placeholder SVG thumbnails ──────────────────────────────────────────────
// `appearance.ts` builds inline SVG `data:` URIs for the "Keine" null items
// and for body-type thumbnails. They render on `<img>` elements and cannot use
// CSS `var()`, so the colors are resolved here in JS via `resolveToken`.

/** Escapes a string for safe embedding as XML text content. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds a 56×56 SVG `data:` URI for an appearance placeholder thumbnail.
 *
 * @param label   Text to display inside the SVG (e.g. `'Keine'` or a body key).
 * @param variant `'empty'` = muted dash (for "Keine" nullItem), `'body'` = brass label.
 * @param getVar  Optional CSS-variable resolver.
 */
export function placeholderSvg(
  label: string,
  variant: 'empty' | 'body',
  getVar?: VarGetter,
): string {
  const bg = resolveToken('--slate-1', '#161922', getVar);

  let textFill: string;
  let fontSize: number;
  let dy: number;
  let displayLabel: string;

  if (variant === 'empty') {
    textFill = resolveToken('--parchment-3', '#7c8071', getVar);
    fontSize = 20;
    dy = 34;
    displayLabel = '—';
  } else {
    textFill = resolveToken('--brass', '#c8a96e', getVar);
    fontSize = 11;
    dy = 36;
    displayLabel = label;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56">` +
    `<rect width="56" height="56" fill="${xmlEscape(bg)}"/>` +
    `<text x="28" y="${dy}" text-anchor="middle" fill="${xmlEscape(textFill)}" font-size="${fontSize}">${xmlEscape(displayLabel)}</text>` +
    `</svg>`;

  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
