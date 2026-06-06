// Pure decision logic for the summary-driven Sidekick nudge.
// No DOM, no fetch — kept here so it is unit-testable in the node vitest env.
// The Svelte components import and render these results; the cross-component
// DOM wiring is covered by Playwright (fa-46-lernpfad-cta.spec.ts).

export type SidekickView =
  | 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'agent-guide';

const KNOWN_VIEWS: ReadonlySet<string> = new Set([
  'home', 'support', 'questionnaire', 'help', 'tickets', 'inbox', 'agent-guide',
]);

export interface BannerInput { done: number; total: number; }
export interface BannerDecision {
  kind: 'start' | 'continue' | 'done';
  label: string;
  done: number;
  total: number;
  cta: boolean;       // false only for the done state
}

/** Decide the home-banner state from the learning summary. Fail-soft: null → no banner. */
export function decideBanner(summary: BannerInput | null): BannerDecision | null {
  if (!summary || summary.total <= 0) return null;
  const { done, total } = summary;
  if (done >= total) {
    return { kind: 'done', label: '✓ Lernpfad abgeschlossen', done, total, cta: false };
  }
  if (done <= 0) {
    return { kind: 'start', label: 'Starte deinen Lernpfad', done, total, cta: true };
  }
  return { kind: 'continue', label: `Weiter lernen · ${done}/${total}`, done, total, cta: true };
}

export interface NavigateIntent { view: SidekickView; jumpTo: string | null; }

/** Validate the detail of a `sidekick:navigate` CustomEvent. Returns null if invalid. */
export function parseNavigateEvent(detail: unknown): NavigateIntent | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as { view?: unknown; jumpTo?: unknown };
  if (typeof d.view !== 'string' || !KNOWN_VIEWS.has(d.view)) return null;
  const jumpTo = typeof d.jumpTo === 'string' ? d.jumpTo : null;
  return { view: d.view as SidekickView, jumpTo };
}

/**
 * Pure predicate for the FAB attention dot. The dot shows only in the portal
 * context, only when a summary loaded with canonical items left to learn
 * (`0 < done < total`), and only when no numeric badge already occupies the FAB
 * corner. PortalSidekick derives `showLearnDot` from this (plus its own `!open`).
 */
export function shouldShowLearnDot(
  summary: BannerInput | null,
  helpContext: string,
  hasNumericBadge: boolean,
): boolean {
  if (helpContext !== 'portal') return false;
  if (hasNumericBadge) return false;
  if (!summary || summary.total <= 0) return false;
  return summary.done < summary.total;
}
