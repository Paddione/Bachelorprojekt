import { describe, it, expect } from 'vitest';
import { TICKET_STATUSES, VALID_STATUSES, isValidStatus } from '../status';

describe('status.ts — ticket status vocabulary SSOT (T007955)', () => {
  it('exports the 11 canonical ticket statuses', () => {
    expect(TICKET_STATUSES).toEqual([
      'triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review',
      'qa_review', 'blocked', 'awaiting_deploy', 'done', 'archived',
    ]);
  });

  it('contains no duplicate statuses', () => {
    expect(new Set(TICKET_STATUSES).size).toBe(TICKET_STATUSES.length);
  });

  it('isValidStatus accepts every valid status', () => {
    for (const s of TICKET_STATUSES) {
      expect(isValidStatus(s)).toBe(true);
    }
  });

  it('isValidStatus rejects invalid strings', () => {
    expect(isValidStatus('gibberish')).toBe(false);
    expect(isValidStatus('')).toBe(false);
    expect(isValidStatus('DONE')).toBe(false);
    expect(isValidStatus('done ')).toBe(false);
  });

  it('VALID_STATUSES is a ReadonlySet mirroring TICKET_STATUSES exactly', () => {
    expect(VALID_STATUSES).toBeInstanceOf(Set);
    expect(VALID_STATUSES.size).toBe(TICKET_STATUSES.length);
    for (const s of TICKET_STATUSES) {
      expect(VALID_STATUSES.has(s)).toBe(true);
    }
  });
});
