// Client-safe utilities extracted from factory-floor.ts.
// NO server imports — safe to bundle for the browser.

export type Phase = 'scout' | 'design' | 'plan' | 'implement' | 'verify' | 'deploy';
export type PhaseState = 'entered' | 'done' | 'blocked';

export interface PhaseEventRow {
  phase: Phase;
  state: PhaseState;
  detail: string | null;
  driver: string;
  at: string;
}

export interface TimelineEntry extends PhaseEventRow {
  durationSec: number | null;
}

export function phaseDurations(events: PhaseEventRow[]): TimelineEntry[] {
  const asc = [...events].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  return asc.map((e, i) => ({
    ...e,
    durationSec: i === 0 ? null : Math.round((+new Date(e.at) - +new Date(asc[i - 1].at)) / 1000),
  }));
}
