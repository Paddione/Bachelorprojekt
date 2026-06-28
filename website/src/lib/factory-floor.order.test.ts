import { describe, it, expect } from 'vitest';
import {
  PIPELINE_LANES,
  PIPELINE_STATUSES,
  STATUS_BUCKETS,
  ALL_TICKET_STATUSES,
  type LaneKey,
} from './tickets/pipeline-order';
// Re-export contract: the same symbols must be reachable from factory-floor.ts so
// existing consumers (SP2/SP3/SP4) keep importing from '../lib/factory-floor'.
import {
  PIPELINE_LANES as FF_PIPELINE_LANES,
  STATUS_BUCKETS as FF_STATUS_BUCKETS,
  ALL_TICKET_STATUSES as FF_ALL_TICKET_STATUSES,
} from './factory-floor';
import { TABS, MOBILE_COL_INDEX } from '../components/factory/MobileTabBar.svelte';
import { PHASE_ORDER } from './factory-floor-types';

// The declared expectation, independent of the implementation. Front→back, linear lanes only.
const EXPECTED_LINEAR_STATUSES = [
  'triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'qa_review', 'awaiting_deploy', 'done',
] as const;

// The byte-identical bucket map the codebase shipped before centralization.
const EXPECTED_BUCKETS: Record<string, LaneKey> = {
  triage: 'planning', planning: 'planning', plan_staged: 'staged', backlog: 'loadingDock',
  in_progress: 'hall', in_review: 'hall', blocked: 'attention', qa_review: 'qa',
  awaiting_deploy: 'awaitingDeploy',
  done: 'shipped', archived: 'archive',
};

describe('pipeline-order SSOT', () => {
  it('PIPELINE_STATUSES is the linear front→back sequence (qa_review before done)', () => {
    expect([...PIPELINE_STATUSES]).toEqual([...EXPECTED_LINEAR_STATUSES]);
    // explicit lifecycle-direction guard against the "verkehrt herum" regression
    expect(PIPELINE_STATUSES.indexOf('qa_review')).toBeLessThan(PIPELINE_STATUSES.indexOf('done'));
  });

  it('derived STATUS_BUCKETS is byte-identical to the pre-centralization map', () => {
    expect(STATUS_BUCKETS).toEqual(EXPECTED_BUCKETS);
  });

  it('every ALL_TICKET_STATUSES member maps to exactly one lane', () => {
    for (const s of ALL_TICKET_STATUSES) {
      expect(STATUS_BUCKETS[s]).toBeDefined();
    }
  });

  it('PIPELINE_LANES statuses cover ALL_TICKET_STATUSES exactly (set equality)', () => {
    const laneStatuses = PIPELINE_LANES.flatMap((l) => l.statuses).sort();
    expect(laneStatuses).toEqual([...ALL_TICKET_STATUSES].sort());
  });

  it('side lanes (blocked/archived) are excluded from the linear pipeline', () => {
    const sideStatuses = PIPELINE_LANES.filter((l) => l.side).flatMap((l) => l.statuses);
    expect(sideStatuses.sort()).toEqual(['archived', 'blocked']);
    for (const s of sideStatuses) {
      expect(PIPELINE_STATUSES).not.toContain(s);
    }
  });

  it('factory-floor.ts re-exports the SSOT symbols unchanged (consumer contract)', () => {
    expect(FF_PIPELINE_LANES).toBe(PIPELINE_LANES);
    expect(FF_STATUS_BUCKETS).toBe(STATUS_BUCKETS);
    expect(FF_ALL_TICKET_STATUSES).toBe(ALL_TICKET_STATUSES);
  });

  // ---- Component-order checks wired by Sub-Plan 4 (T000922). ----
  // SP4 owns MobileTabBar.svelte / FactoryFloor.svelte; TABS, MOBILE_COL_INDEX,
  // and macro-lane DOM order are derived from PIPELINE_LANES/PHASE_ORDER.
  it('SP4: MobileTabBar.TABS order matches the SSOT-derived lane/phase order', () => {
    const linearLanes = PIPELINE_LANES.filter(l => !l.side && l.key !== 'planning');
    const keyMap: Record<string, string> = { loadingDock: 'backlog', qa: 'qs', shipped: 'done' };
    const expectedKeys = linearLanes.flatMap(l =>
      l.key === 'hall'
        ? [...PHASE_ORDER]
        : [keyMap[l.key] || l.key]
    );
    expect(TABS.map(t => t.key)).toEqual(expectedKeys);
  });

  it('SP4: MOBILE_COL_INDEX order matches the SSOT-derived lane/phase order', () => {
    for (let i = 0; i < TABS.length; i++) {
      expect(MOBILE_COL_INDEX[TABS[i].key]).toBe(i);
    }
    expect(Object.keys(MOBILE_COL_INDEX)).toHaveLength(TABS.length);
  });

  it('SP4: FactoryFloor macro-lane DOM order matches PIPELINE_LANES (qa before done)', () => {
    const nonSide = PIPELINE_LANES.filter(l => !l.side);
    const qaIdx = nonSide.findIndex(l => l.key === 'qa');
    const shippedIdx = nonSide.findIndex(l => l.key === 'shipped');
    expect(qaIdx).toBeGreaterThanOrEqual(0);
    expect(shippedIdx).toBeGreaterThanOrEqual(0);
    expect(qaIdx).toBeLessThan(shippedIdx);
  });
});
