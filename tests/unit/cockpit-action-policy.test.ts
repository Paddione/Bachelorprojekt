import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const policyPath = join(__dirname, '../../.lavish/kit/action-policy.js');

function loadPolicy() {
  const src = readFileSync(policyPath, 'utf8');
  const win: Record<string, unknown> = {};
  // eslint-disable-next-line no-new-func
  new Function('window', src)(win);
  return win.actionPolicy as {
    ACTION_STATES: string[];
    classify: (action: string) => string;
    confirmationFor: (action: string, target?: string) => unknown;
    mobileLock: (action: string, opts: { viewport: string; unlockedThisSession: boolean }) => boolean;
  };
}

describe('action-policy (K4 D4/D5/D6)', () => {
  const policy = loadPolicy();

  it('has all four ACTION_STATES from D4', () => {
    expect(policy.ACTION_STATES).toEqual(['available', 'locked', 'confirming', 'running']);
  });

  it('classifies repeatable actions', () => {
    for (const a of ['refresh', 'reconcile', 'tick', 'enqueue']) {
      expect(policy.classify(a)).toBe('repeatable');
    }
  });

  it('classifies reversible actions', () => {
    for (const a of ['ticket_status', 'panel_close']) {
      expect(policy.classify(a)).toBe('reversible');
    }
  });

  it('classifies irreversible actions', () => {
    for (const a of ['pr_merge', 'agent_kill', 'worktree_remove', 'lock_break']) {
      expect(policy.classify(a)).toBe('irreversible');
    }
  });

  it('treats an unknown action as irreversible (safe direction)', () => {
    expect(policy.classify('some_future_action')).toBe('irreversible');
  });

  it('confirmationFor: repeatable needs no confirmation', () => {
    expect(policy.confirmationFor('refresh')).toBeNull();
    expect(policy.confirmationFor('tick')).toBeNull();
  });

  it('confirmationFor: reversible gets a simple confirmation', () => {
    expect(policy.confirmationFor('ticket_status')).toEqual({ level: 'simple' });
  });

  it('confirmationFor: irreversible names the target', () => {
    expect(policy.confirmationFor('pr_merge', 'PR #123')).toEqual({ level: 'named', target: 'PR #123' });
  });

  it('confirmationFor: irreversible without a target throws', () => {
    expect(() => policy.confirmationFor('pr_merge')).toThrow();
  });

  it('mobileLock: locks irreversible actions on mobile until unlocked', () => {
    expect(policy.mobileLock('pr_merge', { viewport: 'mobile', unlockedThisSession: false })).toBe(true);
    expect(policy.mobileLock('pr_merge', { viewport: 'mobile', unlockedThisSession: true })).toBe(false);
  });

  it('mobileLock: locks irreversible actions in fullscreen on a small viewport', () => {
    expect(policy.mobileLock('agent_kill', { viewport: 'fullscreen', unlockedThisSession: false })).toBe(true);
  });

  it('mobileLock: never locks a repeatable action', () => {
    expect(policy.mobileLock('refresh', { viewport: 'mobile', unlockedThisSession: false })).toBe(false);
  });

  it('mobileLock: does not lock on a large viewport', () => {
    expect(policy.mobileLock('pr_merge', { viewport: 'card', unlockedThisSession: false })).toBe(false);
  });
});
