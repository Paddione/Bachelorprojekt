import { describe, it, expect, beforeEach } from 'vitest';
import { registerTrigger, evaluateTriggers, _resetTriggersForTest } from './triggers';

describe('trigger registry', () => {
  beforeEach(() => _resetTriggersForTest());

  it('returns a nudge when the evaluator produces one', async () => {
    registerTrigger({
      id: 'morning-briefing',
      profile: 'admin',
      async evaluate() {
        return {
          id: 'morning-briefing',
          triggerId: 'morning-briefing',
          profile: 'admin',
          headline: 'Heute',
          body: '3 offene Meetings',
          createdAt: new Date().toISOString(),
        };
      },
    });
    const nudges = await evaluateTriggers('admin', { userSub: 'u', currentRoute: '/admin' });
    expect(nudges).toHaveLength(1);
    expect(nudges[0].headline).toBe('Heute');
  });

  it('skips evaluators whose profile does not match', async () => {
    registerTrigger({
      id: 'admin-only',
      profile: 'admin',
      async evaluate() { return { id: 'x', triggerId: 'admin-only', profile: 'admin', headline: 'h', body: 'b', createdAt: '' }; },
    });
    const nudges = await evaluateTriggers('portal', { userSub: 'u', currentRoute: '/portal' });
    expect(nudges).toHaveLength(0);
  });

  it('returns nothing when an evaluator declines (returns null)', async () => {
    registerTrigger({
      id: 'noop',
      profile: 'admin',
      async evaluate() { return null; },
    });
    const nudges = await evaluateTriggers('admin', { userSub: 'u', currentRoute: '/admin' });
    expect(nudges).toHaveLength(0);
  });
});
