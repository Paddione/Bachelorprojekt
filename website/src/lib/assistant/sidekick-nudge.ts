// Pure decision logic for the Sidekick navigation.
// No DOM, no fetch — kept here so it is unit-testable in the node vitest env.

export type SidekickView =
  | 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'cockpit' | 'mediaviewer' | 'terminal' | 'ai-quality';

const KNOWN_VIEWS: ReadonlySet<string> = new Set([
  'home', 'support', 'questionnaire', 'help', 'agent-guide', 'cockpit', 'mediaviewer', 'terminal', 'ai-quality',
]);

export interface NavigateIntent { view: SidekickView; jumpTo: string | null; }

/** Validate the detail of a `sidekick:navigate` CustomEvent. Returns null if invalid. */
export function parseNavigateEvent(detail: unknown): NavigateIntent | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as { view?: unknown; jumpTo?: unknown };
  if (typeof d.view !== 'string' || !KNOWN_VIEWS.has(d.view)) return null;
  const jumpTo = typeof d.jumpTo === 'string' ? d.jumpTo : null;
  return { view: d.view as SidekickView, jumpTo };
}
