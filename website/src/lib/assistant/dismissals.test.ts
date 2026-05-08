import { describe, it, expect } from 'vitest';
import { snoozeNudge, isSnoozed, listFirstSeenAt, recordFirstSeen } from './dismissals';

// NOTE: integration tests — require shared-db. Not run in CI.
describe.skip('assistant_nudge_dismissals + first_seen (integration)', () => {
  it('respects a snooze window for a single user/nudge', async () => {
    const userSub = `t-${Date.now()}`;
    expect(await isSnoozed(userSub, 'morning-briefing')).toBe(false);
    await snoozeNudge(userSub, 'morning-briefing', 60);
    expect(await isSnoozed(userSub, 'morning-briefing')).toBe(true);
  });

  it('records first-seen exactly once per (user, profile)', async () => {
    const userSub = `t-${Date.now()}`;
    expect(await listFirstSeenAt(userSub, 'portal')).toBeNull();
    const ts1 = await recordFirstSeen(userSub, 'portal');
    const ts2 = await recordFirstSeen(userSub, 'portal');
    expect(ts1).toEqual(ts2);
  });
});
