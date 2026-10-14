import { describe, it, expect } from 'vitest';
import {
  buildLiveFloor,
  failingCheckNames,
  isStale,
  prAction,
  type LivePr,
} from './cockpit-live';

const NOW = new Date('2026-10-14T12:00:00Z').getTime();
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

function pr(over: Partial<LivePr> = {}): LivePr {
  return {
    number: 1, title: 'T', branch: 'feature/x', draft: false,
    mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', updatedAt: daysAgo(1),
    checks: [{ name: 'CI', status: 'completed', conclusion: 'success', url: null }],
    ...over,
  };
}

describe('cockpit-live stale boundary', () => {
  it('flags strictly older than threshold, keeps boundary fresh', () => {
    expect(isStale(daysAgo(15), NOW, 14)).toBe(true);
    expect(isStale(daysAgo(13), NOW, 14)).toBe(false);
    expect(isStale(new Date(NOW - 14 * 24 * 60 * 60 * 1000 - 1000).toISOString(), NOW, 14)).toBe(true);
  });
  it('treats missing or unparsable dates as stale', () => {
    expect(isStale(null, NOW, 14)).toBe(true);
    expect(isStale('kein-datum', NOW, 14)).toBe(true);
  });
});

describe('cockpit-live failing checks', () => {
  it('names only completed non-clean checks', () => {
    expect(failingCheckNames([
      { name: 'a', status: 'completed', conclusion: 'failure', url: null },
      { name: 'b', status: 'completed', conclusion: 'success', url: null },
      { name: 'c', status: 'in_progress', conclusion: null, url: null },
      { name: 'd', status: 'completed', conclusion: 'neutral', url: null },
    ])).toEqual(['a']);
  });
});

describe('cockpit-live exactly one action', () => {
  it('derives the fix action with failing names', () => {
    expect(prAction(pr({
      checks: [{ name: 'Unit', status: 'completed', conclusion: 'failure', url: null }],
    }))).toBe('Fehlende Checks fixen: Unit');
  });
  it('prefers draft resolution over pending checks', () => {
    expect(prAction(pr({
      draft: true,
      checks: [{ name: 'CI', status: 'in_progress', conclusion: null, url: null }],
    }))).toBe('Entwurf auflösen und Review anfordern');
  });
  it('recommends squash-merge when clean and mergeable', () => {
    expect(prAction(pr())).toBe('Squash-mergen');
  });
  it('flags conflicts before merge', () => {
    expect(prAction(pr({ mergeable: 'CONFLICTING' }))).toBe('Merge-Konflikte auflösen');
  });
});

describe('cockpit-live floor builder', () => {
  it('returns empty views for empty input without crashing', () => {
    const floor = buildLiveFloor({ branches: [], plans: [], prs: [] }, NOW);
    expect(floor.openWork).toEqual([]);
    expect(floor.prReady).toEqual([]);
    expect(floor.ciRed).toEqual([]);
    expect(floor.stale).toEqual([]);
    expect(floor.nextActions).toEqual([]);
    expect(floor.degraded).toEqual([]);
  });
  it('skips default branch and PR-linked branches in open work', () => {
    const floor = buildLiveFloor({
      branches: [
        { name: 'main', lastCommitAt: daysAgo(1), hasUpstream: true, isDefault: true },
        { name: 'feature/a', lastCommitAt: daysAgo(1), hasUpstream: true, isDefault: false },
        { name: 'feature/b', lastCommitAt: daysAgo(1), hasUpstream: false, isDefault: false },
      ],
      plans: [{ ref: 'plan-x', title: 'X', status: 'done' }],
      prs: [pr({ branch: 'feature/a' })],
    }, NOW);
    expect(floor.openWork.map((r) => r.label)).toEqual(['feature/b']);
    expect(floor.openWork[0].action).toBe('PR erstellen');
  });
  it('prioritizes CI-red first in next actions', () => {
    const floor = buildLiveFloor({
      branches: [],
      plans: [],
      prs: [
        pr({ number: 10, title: 'sauber', branch: 'feature/ok' }),
        pr({
          number: 11, title: 'rot', branch: 'feature/rot',
          checks: [{ name: 'Unit', status: 'completed', conclusion: 'failure', url: null }],
        }),
      ],
    }, NOW);
    expect(floor.nextActions[0].label).toContain('#11');
    expect(floor.ciRed).toHaveLength(1);
  });
});
