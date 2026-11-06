// scripts/knowledge/audit-integrity.test.mjs — Phase-Events ohne tickets-Schema (#7162).
// Stil wie dense-migration.test.mjs: node:test, injizierte queryFn, kein echtes Postgres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAudit } from './audit-integrity.mjs';

function baseQueryFn({ onPhaseEvents }) {
  return async (sql) => {
    if (sql.includes('factory_phase_events')) {
      return onPhaseEvents();
    }
    if (sql.includes('information_schema') && sql.includes('github_')) {
      return { rows: [{ count: 0 }] };
    }
    if (sql.includes('github_objects')) {
      return { rows: [{ total: 0 }] };
    }
    if (sql.includes('FROM tickets.tickets')) {
      return { rows: [{ count: 0 }] };
    }
    if (sql.includes('knowledge.collections')) {
      return { rows: [] };
    }
    if (sql.includes('embedding_model')) {
      return { rows: [] };
    }
    if (sql.includes('knowledge.documents')) {
      return { rows: [] };
    }
    return { rows: [] };
  };
}

test('phase_events ohne tickets-Schema: skip statt Abbruch (#7162)', async () => {
  const queryFn = baseQueryFn({
    onPhaseEvents: () => {
      const err = new Error('relation "tickets.factory_phase_events" does not exist');
      err.code = '42P01';
      throw err;
    },
  });
  const out = await runAudit({ queryFn, repoRoot: '/tmp' });
  assert.equal(out.phase_events.skipped, true);
  assert.equal(out.phase_events.tickets_inspected, 0);
  assert.equal(out.phase_events.order_violations, 0);
  assert.equal(out.phase_events.gaps, 0);
});

test('phase_events geordnet: keine Violations', async () => {
  const queryFn = baseQueryFn({
    onPhaseEvents: () => ({
      rows: [
        { ticket_id: 'T1', id: 1, phase: 'plan', state: 'done', at: '2026-11-01', detail: '' },
        { ticket_id: 'T1', id: 2, phase: 'implement', state: 'entered', at: '2026-11-02', detail: '' },
        { ticket_id: 'T1', id: 3, phase: 'verify', state: 'done', at: '2026-11-03', detail: '' },
      ],
    }),
  });
  const out = await runAudit({ queryFn, repoRoot: '/tmp' });
  assert.equal(out.phase_events.skipped, false);
  assert.equal(out.phase_events.tickets_inspected, 1);
  assert.equal(out.phase_events.order_violations, 0);
  assert.equal(out.phase_events.gaps, 0);
});

test('phase_events ungeordnet: Order-Violation zaehlt', async () => {
  const queryFn = baseQueryFn({
    onPhaseEvents: () => ({
      rows: [
        { ticket_id: 'T9', id: 7, phase: 'implement', state: 'entered', at: '2026-11-02', detail: '' },
      ],
    }),
  });
  const out = await runAudit({ queryFn, repoRoot: '/tmp' });
  assert.equal(out.phase_events.skipped, false);
  assert.equal(out.phase_events.order_violations, 1);
  assert.equal(out.phase_events.gaps, 1);
});
