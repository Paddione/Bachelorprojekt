import { describe, it, expect } from 'vitest';
import { STATUS_LABELS } from '../../lib/tickets/cockpit-labels';

describe('Sidekick ticket status options', () => {
  it('cockpit-labels covers the states the Sidekick must show (no blank dropdown)', () => {
    for (const s of ['triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'qa_review', 'blocked', 'done', 'archived']) {
      expect(STATUS_LABELS[s]).toBeTruthy();
    }
  });
});
