import { describe, it, expect } from 'vitest';
import {
  canLock,
  normalizeRequirements,
  nextStatusOnLock,
  requirementsLabel,
  isLastenheftLocked,
  LASTENHEFT_LOCK_KEY,
} from './lastenheft';

describe('lastenheft helpers', () => {
  it('normalizeRequirements trims and drops empties', () => {
    expect(normalizeRequirements([' a ', '', '  ', 'b', null, undefined])).toEqual(['a', 'b']);
    expect(normalizeRequirements(null)).toEqual([]);
    expect(normalizeRequirements(undefined)).toEqual([]);
  });

  it('canLock requires >=1 non-empty requirement', () => {
    expect(canLock([])).toBe(false);
    expect(canLock(['  ', ''])).toBe(false);
    expect(canLock(null)).toBe(false);
    expect(canLock(['needs auth'])).toBe(true);
    expect(canLock([' ', 'real req'])).toBe(true);
  });

  it('nextStatusOnLock forward-only into backlog, never regresses', () => {
    expect(nextStatusOnLock('triage')).toBe('backlog');
    expect(nextStatusOnLock('planning')).toBe('backlog');
    expect(nextStatusOnLock('plan_staged')).toBe('backlog');
    // in-flight / terminal statuses are left untouched
    expect(nextStatusOnLock('backlog')).toBe('backlog');
    expect(nextStatusOnLock('in_progress')).toBe('in_progress');
    expect(nextStatusOnLock('in_review')).toBe('in_review');
    expect(nextStatusOnLock('done')).toBe('done');
    expect(nextStatusOnLock('archived')).toBe('archived');
  });

  it('requirementsLabel flips on lock', () => {
    expect(requirementsLabel(false)).toBe('Pflichtenheft');
    expect(requirementsLabel(true)).toBe('Lastenheft');
  });

  it('isLastenheftLocked reads the readiness flag fail-closed', () => {
    expect(isLastenheftLocked({ [LASTENHEFT_LOCK_KEY]: true })).toBe(true);
    expect(isLastenheftLocked({ [LASTENHEFT_LOCK_KEY]: false })).toBe(false);
    expect(isLastenheftLocked({ spec_skizziert: true })).toBe(false);
    expect(isLastenheftLocked(null)).toBe(false);
    expect(isLastenheftLocked(undefined)).toBe(false);
  });
});
