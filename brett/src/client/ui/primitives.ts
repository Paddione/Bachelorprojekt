// brett/src/client/ui/primitives.ts — Phase A / A3
//
// Brett UI primitives (mentolder look). Two layers:
//   1. Pure class helpers (panelClass/buttonClass/…) → deterministic BEM-ish
//      class strings; fully node-testable.
//   2. DOM factories (Panel/Button/Field/…) building HTMLElements with those
//      classes. DOM access lives ONLY inside factory bodies, so the module is
//      importable under node/tsx (unlike the legacy top-level-getElementById
//      pattern in hud.ts / fig-panel.ts).
//
// All styling references brett tokens exclusively via `var(--brett-*)` (from A1's
// themeCss()), never raw brand hex — so the look is token-driven.
//
// RosterItem/Badge live in primitives-roster.ts (module-budget split, §6d) and
// are re-exported here.

export {
  RosterItem, Badge, rosterItemClass, badgeClass, rosterCss,
} from './primitives-roster';
export type { BadgeTone, RosterItemOptions, BadgeOptions } from './primitives-roster';

import { rosterCss } from './primitives-roster';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';

export interface PanelOptions { pad?: boolean; }
export interface ButtonOptions { variant?: ButtonVariant; }
export interface FieldOptions { invalid?: boolean; }
export interface DrawerOptions { open?: boolean; }

// ── Pure class helpers ──────────────────────────────────────────────

export function panelClass(opts: PanelOptions = {}): string {
  return opts.pad ? 'brett-panel brett-panel--pad' : 'brett-panel';
}

export function buttonClass(opts: ButtonOptions = {}): string {
  return opts.variant ? `brett-btn brett-btn--${opts.variant}` : 'brett-btn';
}

export function fieldClass(opts: FieldOptions = {}): string {
  return opts.invalid ? 'brett-field brett-field--invalid' : 'brett-field';
}

export function drawerClass(opts: DrawerOptions = {}): string {
  return opts.open ? 'brett-drawer brett-drawer--open' : 'brett-drawer';
}

// ── DOM factories ───────────────────────────────────────────────────

export function Panel(opts: { pad?: boolean; children?: (HTMLElement | string)[] } = {}): HTMLElement {
  const el = document.createElement('div');
  el.className = panelClass({ pad: opts.pad });
  for (const c of opts.children ?? []) el.append(c);
  return el;
}

export function Button(opts: {
  label: string;
  variant?: ButtonVariant;
  onClick?: () => void;
}): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = buttonClass({ variant: opts.variant });
  el.textContent = opts.label;
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}

export function Field(opts: {
  placeholder?: string;
  value?: string;
  invalid?: boolean;
  onInput?: (v: string) => void;
} = {}): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'text';
  el.className = fieldClass({ invalid: opts.invalid });
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.value) el.value = opts.value;
  if (opts.onInput) el.addEventListener('input', () => opts.onInput!(el.value));
  return el;
}

export function Drawer(opts: { open?: boolean; children?: (HTMLElement | string)[] } = {}): HTMLElement {
  const el = document.createElement('div');
  el.className = drawerClass({ open: opts.open });
  for (const c of opts.children ?? []) el.append(c);
  return el;
}

/**
 * Shared token-based styling for native `<select>` elements (T002006/D4) — the
 * `.brett-lobby__select` look, applied inline so ad-hoc selects outside lobby.ts
 * (hud.ts, topbar-participants.ts, zone-editor.ts) get consistent theming. Also
 * darkens each `<option>` so the native dropdown list stays readable on dark UI.
 */
export function styleSelect(el: HTMLSelectElement): void {
  el.style.background = 'var(--brett-ink-850)';
  el.style.color = 'var(--brett-fg)';
  el.style.border = '1px solid var(--brett-line-2)';
  el.style.borderRadius = '8px';
  el.style.padding = '4px 8px';
  el.style.fontFamily = 'var(--brett-font-sans)';
  for (const opt of Array.from(el.options)) {
    opt.style.background = 'var(--brett-ink-850)';
    opt.style.color = 'var(--brett-fg)';
  }
}

// ── Styles ──────────────────────────────────────────────────────────

const PRIMITIVES_STYLE_ID = 'brett-primitives';

export function primitivesCss(): string {
  return [
    '.brett-panel{',
    '  background:var(--brett-surface);',
    '  border:1px solid var(--brett-line);',
    '  border-radius:var(--brett-radius);',
    '  color:var(--brett-fg);font-family:var(--brett-font-sans);',
    '}',
    '.brett-panel--pad{padding:22px;}',
    '.brett-btn{',
    '  display:inline-flex;align-items:center;justify-content:center;gap:8px;',
    '  padding:10px 18px;border-radius:12px;cursor:pointer;',
    '  font-family:var(--brett-font-sans);font-size:14px;font-weight:600;',
    '  background:transparent;color:var(--brett-fg);',
    '  border:1px solid var(--brett-line-2);transition:background 0.15s,border-color 0.15s;',
    '}',
    '.brett-btn:hover{background:var(--brett-surface-hover);}',
    '.brett-btn--primary{background:var(--brett-brass);color:var(--brett-ink-900);border-color:transparent;}',
    '.brett-btn--primary:hover{filter:brightness(1.06);background:var(--brett-brass-2);}',
    '.brett-btn--ghost{background:transparent;border-color:var(--brett-line);color:var(--brett-fg-soft);}',
    '.brett-btn--danger{background:transparent;border-color:var(--brett-line-2);color:var(--brett-mute);}',
    '.brett-field{',
    '  width:100%;padding:10px 12px;border-radius:12px;',
    '  background:var(--brett-ink-850);color:var(--brett-fg);',
    '  border:1px solid var(--brett-line-2);',
    '  font-family:var(--brett-font-sans);font-size:14px;',
    '}',
    '.brett-field:focus{outline:none;border-color:var(--brett-brass);}',
    '.brett-field::placeholder{color:var(--brett-mute-2);}',
    '.brett-field--invalid{border-color:var(--brett-brass);}',
    '.brett-drawer{',
    '  background:var(--brett-surface);',
    '  border-left:1px solid var(--brett-line);',
    '  color:var(--brett-fg);font-family:var(--brett-font-sans);',
    '  transform:translateX(100%);transition:transform 200ms ease;',
    '}',
    '.brett-drawer--open{transform:translateX(0);}',
    rosterCss(),
  ].join('\n');
}

/**
 * Idempotent: id-guarded `<style id="brett-primitives">`. DOM only inside body.
 */
export function injectPrimitivesStyles(doc: Document = document): void {
  let style = doc.getElementById(PRIMITIVES_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = PRIMITIVES_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = primitivesCss();
}
