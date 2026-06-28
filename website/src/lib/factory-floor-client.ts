// Client-safe utilities extracted from factory-floor.ts.
// NO server imports — safe to bundle for the browser.

type Phase = 'scout' | 'design' | 'plan' | 'implement' | 'verify' | 'deploy';
type PhaseState = 'entered' | 'done' | 'blocked';

interface PhaseEventRow {
  phase: Phase;
  state: PhaseState;
  detail: string | null;
  driver: string;
  at: string;
}

interface TimelineEntry extends PhaseEventRow {
  durationSec: number | null;
}

export function phaseDurations(events: PhaseEventRow[]): TimelineEntry[] {
  const asc = [...events].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  return asc.map((e, i) => ({
    ...e,
    durationSec: i === 0 ? null : Math.round((+new Date(e.at) - +new Date(asc[i - 1].at)) / 1000),
  }));
}

/** Format a relative timestamp for display (e.g. "vor 3 Min."). */
export function relTime(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `vor ${s} Sek.`;
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tg.`;
}

/** Minutes elapsed since an ISO timestamp (0 if null). */
export function minutesSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

/** Emoji indicator for CI status. */
export function ciIcon(s: 'success' | 'pending' | 'failure' | null): string {
  return s === 'success' ? '🟢' : s === 'failure' ? '🔴' : s === 'pending' ? '🟡' : '';
}

/** Tailwind bg-* class for priority indicator dot. */
export function prioDot(p: string): string {
  if (p === 'hoch') return 'bg-red-400';
  if (p === 'mittel') return 'bg-amber-400';
  if (p === 'niedrig') return 'bg-emerald-400';
  return 'bg-white/40';
}

export const GH_REPO = 'Paddione/Bachelorprojekt';
export const prUrl = (n: number) => `https://github.com/${GH_REPO}/pull/${n}`;
export const ticketUrl = (extId: string) => `/admin/tickets?q=${encodeURIComponent(extId)}`;
export const planUrl = (branch: string, planPath: string) =>
  `https://github.com/${GH_REPO}/blob/${branch}/${planPath}`;
export function openPR(n: number | null) { if (n) window.open(prUrl(n), '_blank', 'noopener'); }
export function assetFallback(e: Event) { (e.currentTarget as HTMLImageElement).style.display = 'none'; }
