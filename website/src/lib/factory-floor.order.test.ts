import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
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

import { TABS } from '../components/factory/MobileTabBar.svelte';
import { MOBILE_COL_INDEX, STATIONS } from '../components/FactoryFloor.svelte';
import { PHASE_ORDER } from './factory-floor';
import { render } from '@testing-library/svelte';
import FactoryFloor from '../components/FactoryFloor.svelte';

// The declared expectation, independent of the implementation. Front→back, linear lanes only.
const EXPECTED_LINEAR_STATUSES = [
  'triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'qa_review', 'awaiting_deploy', 'done',
] as const;

// The byte-identical bucket map the codebase shipped before centralization.
const EXPECTED_BUCKETS: Record<string, LaneKey> = {
  triage: 'planning', planning: 'planning', plan_staged: 'staged', backlog: 'loadingDock',
  in_progress: 'hall', in_review: 'hall', blocked: 'attention', qa_review: 'qa',
  awaiting_deploy: 'awaitingDeploy', done: 'shipped', archived: 'archive',
};

const EXPECTED_MOBILE_SEQUENCE = ['staged', 'backlog', ...PHASE_ORDER, 'qs', 'awaitingDeploy', 'done'];

const MOCK_FLOOR = {
  control: { killSwitch: false, slotsUsed: 0, slotsCap: 3, dailyCap: 5, dailyUsed: 0, dryRun: false, watchdogStale: 0 },
  metrics: { shippedToday: 0, avgCycleH: null },
  loadingDock: [],
  hall: [],
  shipped: [],
  staged: [],
  providerHealth: [],
  officeWaiting: 0,
  stagedWaiting: 0,
  planningCount: { total: 0, ready: 0 },
  attention: { blocked: [], stuck: [], cooldowns: [], isEmpty: true },
  fetchedAt: new Date().toISOString(),
};

beforeAll(() => {
  vi.stubGlobal('EventSource', class {
    addEventListener = vi.fn();
    close = vi.fn();
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('pipeline-order SSOT', () => {
  it('PIPELINE_STATUSES is the linear front→back sequence (qa_review before done)', () => {
    expect([...PIPELINE_STATUSES]).toEqual([...EXPECTED_LINEAR_STATUSES]);
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

  it('MobileTabBar.TABS matches the SSOT-derived front→back sequence', () => {
    expect(TABS.map((t) => t.key)).toEqual(EXPECTED_MOBILE_SEQUENCE);
  });

  it('MOBILE_COL_INDEX matches the SSOT-derived front→back sequence', () => {
    expect(Object.entries(MOBILE_COL_INDEX).sort((a, b) => a[1] - b[1]).map(([k]) => k)).toEqual(EXPECTED_MOBILE_SEQUENCE);
  });

  it('STATIONS (Hall phase columns) equal PHASE_ORDER left→right', () => {
    expect(STATIONS.map((s) => s.key)).toEqual([...PHASE_ORDER]);
  });

  it('FactoryFloor desktop macro-lanes render front→back (qa before done, backlog before hall)', () => {
    const { container } = render(FactoryFloor, { props: { initial: MOCK_FLOOR as any } });
    const order = [...container.querySelectorAll('[data-testid^="floor-"]')].map(
      (e) => (e as HTMLElement).dataset.testid ?? '',
    );
    expect(order.indexOf('floor-loadingdock')).toBeLessThan(order.indexOf('floor-hall'));
    expect(order.indexOf('floor-qa')).toBeLessThan(order.indexOf('floor-awaiting-deploy'));
    expect(order.indexOf('floor-awaiting-deploy')).toBeLessThan(order.indexOf('floor-shipped'));
  });
});
