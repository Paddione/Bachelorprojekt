import { describe, it, expect } from 'vitest';
import { isValidStatus } from './transition';

describe('transition status gate', () => {
  it('accepts qa_review (added on main parity)', () => {
    expect(isValidStatus('qa_review')).toBe(true);
  });
  it('accepts the existing pipeline states', () => {
    for (const s of ['triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'blocked', 'qa_review', 'awaiting_deploy', 'done', 'archived']) {
      expect(isValidStatus(s)).toBe(true);
    }
  });
  it('rejects an unknown state', () => {
    expect(isValidStatus('nonsense')).toBe(false);
  });
});
