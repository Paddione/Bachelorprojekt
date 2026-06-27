import { describe, it, expect } from 'vitest';
import { phaseProgress, phaseDurations, buildAttention, type Phase, type PhaseState, type PhaseEventRow, type HallItem, type ProviderStatus } from './factory-floor';

describe('factory-floor.phaseProgress', () => {
  it('all pending when phase is null', () => {
    const out = phaseProgress(null, null);
    expect(out.every(s => s.state === 'pending')).toBe(true);
    expect(out).toHaveLength(6);
  });

  it('marks all phases before the current as done, the current as active', () => {
    const out = phaseProgress('design' as Phase, 'entered' as PhaseState);
    expect(out[0]).toEqual({ phase: 'scout', state: 'done' });
    expect(out[1]).toEqual({ phase: 'design', state: 'active' });
    expect(out[2]).toEqual({ phase: 'plan', state: 'pending' });
  });

  it('current phase with state=done is done', () => {
    const out = phaseProgress('verify' as Phase, 'done' as PhaseState);
    expect(out[4]).toEqual({ phase: 'verify', state: 'done' });
  });

  it('current phase with state=blocked is blocked', () => {
    const out = phaseProgress('plan' as Phase, 'blocked' as PhaseState);
    expect(out[2]).toEqual({ phase: 'plan', state: 'blocked' });
  });
});

describe('factory-floor.phaseDurations', () => {
  it('returns events in chronological order with first durationSec=null', () => {
    const events: PhaseEventRow[] = [
      { at: '2026-05-20T10:01:00Z', phase: 'plan', state: 'done', detail: null, driver: null },
      { at: '2026-05-20T10:00:00Z', phase: 'design', state: 'done', detail: null, driver: null },
    ];
    const out = phaseDurations(events);
    expect(out[0].phase).toBe('design');
    expect(out[0].durationSec).toBeNull();
    expect(out[1].phase).toBe('plan');
    expect(out[1].durationSec).toBe(60);
  });

  it('returns an empty array for an empty input', () => {
    expect(phaseDurations([])).toEqual([]);
  });
});

describe('factory-floor.buildAttention', () => {
  const hallItem = (overrides: Partial<HallItem> = {}): HallItem => ({
    extId: 'T-1', title: 'X', priority: 'hoch',
    phase: 'scout' as Phase, phaseState: 'entered' as PhaseState, phaseSince: '2026-05-20T10:00:00Z',
    retryCount: 0, blockReason: null, slot: null,
    driver: null, prNumber: null, ciStatus: null, ciUrl: null,
    ...overrides,
  });

  const provider = (overrides: Partial<ProviderStatus> = {}): ProviderStatus => ({
    provider: 'anthropic', status: 'healthy', cooldownUntil: null, ...overrides,
  });

  it('returns isEmpty=true when nothing is happening', () => {
    const out = buildAttention([], []);
    expect(out.isEmpty).toBe(true);
    expect(out.blocked).toEqual([]);
    expect(out.stuck).toEqual([]);
    expect(out.cooldowns).toEqual([]);
  });

  it('captures blocked tickets with their reason', () => {
    const out = buildAttention(
      [hallItem({ extId: 'T-1', phaseState: 'blocked', blockReason: 'review' })],
      [],
    );
    expect(out.blocked).toEqual([{ extId: 'T-1', reason: 'review' }]);
    expect(out.isEmpty).toBe(false);
  });

  it('falls back to "blockiert" when blockReason is null', () => {
    const out = buildAttention(
      [hallItem({ phaseState: 'blocked', blockReason: null })],
      [],
    );
    expect(out.blocked).toEqual([{ extId: 'T-1', reason: 'blockiert' }]);
  });

  it('captures cooldowns from providers', () => {
    const out = buildAttention([], [
      provider({ provider: 'anthropic', status: 'cooldown', cooldownUntil: '2026-05-20T11:00:00Z' }),
      provider({ provider: 'openai', status: 'healthy' }),
    ]);
    expect(out.cooldowns).toEqual([{ provider: 'anthropic', cooldownUntil: '2026-05-20T11:00:00Z' }]);
  });

  it('captures stuck tickets that have been in the same phase for too long', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const out = buildAttention(
      [hallItem({ phaseState: 'entered', phaseSince: thirtyMinAgo })],
      [],
      15, // stuckMin
    );
    expect(out.stuck).toHaveLength(1);
    expect(out.stuck[0].extId).toBe('T-1');
    expect(out.stuck[0].minutes).toBeGreaterThanOrEqual(29);
  });

  it('does NOT count blocked tickets as stuck', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const out = buildAttention(
      [hallItem({ phaseState: 'blocked', phaseSince: thirtyMinAgo })],
      [],
      15,
    );
    expect(out.stuck).toEqual([]);
    expect(out.blocked).toHaveLength(1);
  });
});
