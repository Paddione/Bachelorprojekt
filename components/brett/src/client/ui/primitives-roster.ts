// brett/src/client/ui/primitives-roster.ts — Phase A / A3
//
// RosterItem + Badge primitives, split out of primitives.ts to honour the
// ~300-line module budget (spec §6d). Re-exported from primitives.ts.
// Pure class helpers + DOM factories; DOM access only inside factory bodies.

export type BadgeTone = 'leiter' | 'stellvertreter' | 'beobachter' | 'gast' | 'zuschauer' | 'neutral';

export interface RosterItemOptions {
  active?: boolean;
}

export interface BadgeOptions {
  tone?: BadgeTone;
}

export function rosterItemClass(opts: RosterItemOptions = {}): string {
  return opts.active ? 'brett-roster-item brett-roster-item--active' : 'brett-roster-item';
}

export function badgeClass(opts: BadgeOptions = {}): string {
  return opts.tone ? `brett-badge brett-badge--${opts.tone}` : 'brett-badge';
}

/** Roster row: avatar dot + name + optional trailing slot (role select / kick). */
export function RosterItem(opts: {
  name: string;
  color?: string;
  active?: boolean;
  trailing?: HTMLElement;
} ): HTMLElement {
  const el = document.createElement('div');
  el.className = rosterItemClass({ active: opts.active });

  const dot = document.createElement('span');
  dot.className = 'brett-roster-item__dot';
  if (opts.color) dot.style.background = opts.color;

  const name = document.createElement('span');
  name.className = 'brett-roster-item__name';
  name.textContent = opts.name;

  el.append(dot, name);
  if (opts.trailing) {
    opts.trailing.classList.add('brett-roster-item__trailing');
    el.appendChild(opts.trailing);
  }
  return el;
}

/** Small pill badge, tinted by role tone. */
export function Badge(opts: { text: string; tone?: BadgeTone }): HTMLElement {
  const el = document.createElement('span');
  el.className = badgeClass({ tone: opts.tone });
  el.textContent = opts.text;
  return el;
}

export function rosterCss(): string {
  return [
    '.brett-roster-item{',
    '  display:flex;align-items:center;gap:10px;',
    '  padding:8px 10px;border-radius:12px;',
    '  border:1px solid var(--brett-line);background:var(--brett-ink-850);',
    '  color:var(--brett-fg);font-family:var(--brett-font-sans);font-size:14px;',
    '}',
    '.brett-roster-item--active{border-color:var(--brett-brass);background:var(--brett-surface-hover);}',
    '.brett-roster-item__dot{width:18px;height:18px;border-radius:50%;flex:0 0 auto;background:var(--brett-mute);}',
    '.brett-roster-item__name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.brett-roster-item__trailing{flex:0 0 auto;}',
    '.brett-badge{',
    '  display:inline-flex;align-items:center;gap:4px;',
    '  padding:2px 9px;border-radius:999px;',
    '  font-family:var(--brett-font-sans);font-size:11px;font-weight:600;',
    '  letter-spacing:0.04em;text-transform:uppercase;',
    '  background:var(--brett-brass-dim);color:var(--brett-brass);',
    '  border:1px solid var(--brett-line-2);',
    '}',
    '.brett-badge--leiter{background:var(--brett-brass-dim);color:var(--brett-brass);}',
    '.brett-badge--stellvertreter{background:var(--brett-surface-hover);color:var(--brett-fg-soft);}',
    '.brett-badge--beobachter{background:transparent;color:var(--brett-mute);}',
    '.brett-badge--neutral{background:var(--brett-surface-hover);color:var(--brett-fg-soft);}',
  ].join('\n');
}
