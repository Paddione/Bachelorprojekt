import { phaseProgress, type PhaseProgressSegment, type PhaseEventRow } from '../factory-floor-types';

export interface ExpandLink { label: string; href: string; }
export interface CockpitExpandModel {
  description: string;
  segments: PhaseProgressSegment[];
  links: ExpandLink[];
  latestEvents: { phase: string; state: string; at: string }[];
}
export interface TicketDetailLike {
  description?: string | null;
  prNumber?: number | null;
  events?: PhaseEventRow[];
}

export function toCockpitExpand(detail: TicketDetailLike, repo = ''): CockpitExpandModel {
  const events = detail.events ?? [];
  const latest = events[0];
  const segments = phaseProgress(latest?.phase ?? null, latest?.state ?? null);
  const links: ExpandLink[] = [];
  if (typeof detail.prNumber === 'number') {
    links.push({ label: `PR #${detail.prNumber}`, href: repo ? `${repo}/pull/${detail.prNumber}` : `#pr-${detail.prNumber}` });
  }
  return {
    description: (detail.description ?? '').trim(),
    segments,
    links,
    latestEvents: events.slice(0, 5).map((e) => ({ phase: e.phase, state: e.state, at: e.at })),
  };
}
