// brett/src/client/ui/theme.ts — Phase A / A1
//
// mentolder brand design tokens — Brett-owned SSOT.
//
// These values are a DOCUMENTED, deliberate duplication of the mentolder brand
// palette/typography defined in `website/src/styles/global.css:5-51` (the website
// `@theme` block). There is NO runtime coupling — the website is a separate Astro
// app; Brett ships its own copy so the 3D board can be styled without importing
// Tailwind/website CSS. Keep these in sync by hand if the website tokens change.
//
// Source-of-truth mapping (website var → brett token):
//   --color-ink-900 #0b111c      → tokens.color.ink900
//   --color-ink-850 #101826      → tokens.color.ink850  (== --color-surface)
//   --color-ink-800 #17202e      → tokens.color.ink800  (== --color-surface-hover)
//   --color-ink-750 #1d2736      → tokens.color.ink750
//   --color-fg      #eef1f3      → tokens.color.fg
//   --color-fg-soft #cdd3d9      → tokens.color.fgSoft
//   --color-mute    #8c96a3      → tokens.color.mute
//   --color-mute-2  #6a727e      → tokens.color.mute2
//   --color-brass   oklch(0.80 0.09 75)        → tokens.color.brass
//   --color-brass-2 oklch(0.86 0.09 75)        → tokens.color.brass2
//   --color-brass-d oklch(0.80 0.09 75 / 0.14) → tokens.color.brassDim
//   --color-brass-deep #8a6a2a                 → tokens.color.brassDeep
//   --color-sage    oklch(0.80 0.06 160)       → tokens.color.sage
//   --color-border  rgba(255,255,255,0.10)     → tokens.color.border
//   --color-line    rgba(255,255,255,0.07)     → tokens.color.line
//   --color-line-2  rgba(255,255,255,0.12)     → tokens.color.line2
//   --font-sans / --font-serif / --font-mono   → tokens.font.*
//   --radius 22px / --maxw 1240px              → tokens.radius / tokens.maxw
//
// Systembrett-specific tokens (design system 2026-06-07):
//   --slate-0…3        → tokens.color.slate{0..3}   (board surface stack)
//   --figure-sage-*    → tokens.color.figureSage{|Deep|Soft}
//   --figure-skin-*    → tokens.color.figureSkin{|Deep}
//   --figure-ink       → tokens.color.figureInk
//   --parchment        → tokens.color.parchment
//   --joint-*          → tokens.color.joint{Wrist|Ankle|Knee|Elbow|Head}

export const tokens = {
  color: {
    // Website ink palette
    ink900: '#0b111c',
    ink850: '#101826',
    ink800: '#17202e',
    ink750: '#1d2736',
    surface: '#101826',
    surfaceHover: '#17202e',
    fg: '#eef1f3',
    fgSoft: '#cdd3d9',
    mute: '#8c96a3',
    mute2: '#6a727e',
    brass: 'oklch(0.80 0.09 75)',
    brass2: 'oklch(0.86 0.09 75)',
    brassDim: 'oklch(0.80 0.09 75 / 0.14)',
    brassDeep: '#8a6a2a',
    sage: 'oklch(0.80 0.06 160)',
    border: 'rgba(255, 255, 255, 0.10)',
    line: 'rgba(255, 255, 255, 0.07)',
    line2: 'rgba(255, 255, 255, 0.12)',
    // Systembrett board surface stack
    slate0: '#0e1014',
    slate1: '#161922',
    slate2: '#1f2330',
    slate3: '#2a3040',
    // Figure materials (Lambert shading targets)
    figureSage: '#b8c0a8',
    figureSageDeep: '#8e9a7c',
    figureSageSoft: '#cdd4c0',
    figureSkin: '#d9c89b',
    figureSkinDeep: '#a89567',
    figureInk: '#0b111c',
    parchment: '#e7ead0',
    // Joint markers — fixed semantic meaning, never reassign
    jointWrist: '#e4c452',
    jointAnkle: '#7fa37a',
    jointKnee: '#6f8db8',
    jointElbow: '#c8a96e',
    jointHead: '#d29c8a',
  },
  font: {
    sans: '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    serif: '"Newsreader", "Iowan Old Style", Georgia, serif',
    mono: '"Geist Mono", ui-monospace, "SFMono-Regular", Menlo, monospace',
  },
  radius: '22px',
  radiusMd: '12px',
  radiusSm: '8px',
  radiusPill: '999px',
  maxw: '1240px',
  motion: {
    easeSoft: 'cubic-bezier(.22,.61,.36,1)',
    durFast: '150ms',
    durBase: '200ms',
    durSlow: '500ms',
  },
} as const;

const THEME_STYLE_ID = 'brett-theme';

/**
 * Pure: emits a `:root { --brett-*: …; }` block. Flat `--brett-<name>` var names
 * mirror the website convention. Side-effect-free; safe to import under node/tsx.
 */
export function themeCss(): string {
  const c = tokens.color;
  const m = tokens.motion;
  return [
    ':root {',
    `  --brett-ink-900:${c.ink900};`,
    `  --brett-ink-850:${c.ink850};`,
    `  --brett-ink-800:${c.ink800};`,
    `  --brett-ink-750:${c.ink750};`,
    `  --brett-surface:${c.surface};`,
    `  --brett-surface-hover:${c.surfaceHover};`,
    `  --brett-fg:${c.fg};`,
    `  --brett-fg-soft:${c.fgSoft};`,
    `  --brett-mute:${c.mute};`,
    `  --brett-mute-2:${c.mute2};`,
    `  --brett-brass:${c.brass};`,
    `  --brett-brass-2:${c.brass2};`,
    `  --brett-brass-dim:${c.brassDim};`,
    `  --brett-brass-deep:${c.brassDeep};`,
    `  --brett-sage:${c.sage};`,
    `  --brett-border:${c.border};`,
    `  --brett-line:${c.line};`,
    `  --brett-line-2:${c.line2};`,
    `  --brett-radius:${tokens.radius};`,
    `  --brett-radius-md:${tokens.radiusMd};`,
    `  --brett-radius-sm:${tokens.radiusSm};`,
    `  --brett-radius-pill:${tokens.radiusPill};`,
    `  --brett-maxw:${tokens.maxw};`,
    `  --brett-font-sans:${tokens.font.sans};`,
    `  --brett-font-serif:${tokens.font.serif};`,
    `  --brett-font-mono:${tokens.font.mono};`,
    `  --brett-ease-soft:${m.easeSoft};`,
    `  --brett-dur-fast:${m.durFast};`,
    `  --brett-dur-base:${m.durBase};`,
    `  --brett-dur-slow:${m.durSlow};`,
    `  --brett-slate-0:${c.slate0};`,
    `  --brett-slate-1:${c.slate1};`,
    `  --brett-slate-2:${c.slate2};`,
    `  --brett-slate-3:${c.slate3};`,
    `  --brett-figure-sage:${c.figureSage};`,
    `  --brett-figure-sage-deep:${c.figureSageDeep};`,
    `  --brett-figure-sage-soft:${c.figureSageSoft};`,
    `  --brett-figure-skin:${c.figureSkin};`,
    `  --brett-figure-skin-deep:${c.figureSkinDeep};`,
    `  --brett-figure-ink:${c.figureInk};`,
    `  --brett-parchment:${c.parchment};`,
    `  --brett-joint-wrist:${c.jointWrist};`,
    `  --brett-joint-ankle:${c.jointAnkle};`,
    `  --brett-joint-knee:${c.jointKnee};`,
    `  --brett-joint-elbow:${c.jointElbow};`,
    `  --brett-joint-head:${c.jointHead};`,
    '}',
  ].join('\n');
}

/**
 * Idempotent: appends (or replaces) an id-guarded `<style id="brett-theme">`
 * containing `themeCss()`. DOM access is confined to the function body, so this
 * module stays importable under node/tsx.
 */
export function injectTheme(doc: Document = document): void {
  let style = doc.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = THEME_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = themeCss();
}
