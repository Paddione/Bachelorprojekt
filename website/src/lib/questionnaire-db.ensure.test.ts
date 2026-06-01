// website/src/lib/questionnaire-db.ensure.test.ts
//
// Offline (no real DB) regression test for T000406.
//
// Root cause: the questionnaire_* / systemtest_* schema was only ever created
// by questionnaire-db.ts's fire-and-forget initDb() at module-load time, which
// only runs when questionnaire-db is imported. The background system-test
// CronJob endpoints (drain-outbox / cleanup-fixtures / purge-all) import only
// website-db, so on a fresh korczewski pod that never served a questionnaire/
// admin page the tables never existed and the cron endpoints 500'd.
//
// Fix: ensureQuestionnaireSchemaOnce(pool) — a memoised wrapper the cron
// endpoints call before querying. This test pins the two guarantees the fix
// relies on:
//   1. It actually emits the questionnaire CREATE DDL (so the tables get made).
//   2. It runs that DDL AT MOST ONCE per process, even across many calls and
//      even when called concurrently (the ensureSchemaOnce run-once gate).
//
// We mock `pg` with a CountingPool that swallows every statement and returns an
// empty result, so we don't need a live Postgres or pg-mem DDL compatibility —
// we only care how many times the schema CREATE DDL is issued. Mirrors the
// pattern in platform-db.ensure.test.ts.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('pg', () => {
  class CountingPool {
    static questionnaireCreateDdlCount = 0;
    async query(textOrConfig: unknown, _values?: unknown): Promise<unknown> {
      const sql =
        typeof textOrConfig === 'string'
          ? textOrConfig
          : (textOrConfig as { text?: string })?.text ?? '';
      // Count only the leading CREATE of the questionnaire_templates table —
      // the first statement ensureQuestionnaireSchema() issues. (Other CREATE
      // TABLE statements merely REFERENCE questionnaire_templates in a FK, so a
      // looser regex would over-count a single schema run.)
      if (/^\s*create\s+table\s+if\s+not\s+exists\s+questionnaire_templates\b/i.test(sql)) {
        CountingPool.questionnaireCreateDdlCount += 1;
      }
      return { rows: [], rowCount: 0 };
    }
    async connect(): Promise<{ query: () => Promise<unknown>; release: () => void }> {
      return { query: async () => ({ rows: [], rowCount: 0 }), release: () => {} };
    }
    async end(): Promise<void> {}
  }
  return { default: { Pool: CountingPool }, Pool: CountingPool };
});

// website-db pulls in tickets-db / transition at import; stub them so the module
// graph loads without a DB. ensureSchemaOnce + __resetSchemaInitCacheForTests
// are pure and come through the real website-db module.
vi.mock('./tickets-db', () => ({ initTicketsSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./tickets/transition', () => ({ transitionTicket: vi.fn().mockResolvedValue(undefined) }));

import { pool, __resetSchemaInitCacheForTests } from './website-db';
import { ensureQuestionnaireSchemaOnce } from './questionnaire-db';

const CountingPool = (pool as unknown as {
  constructor: { questionnaireCreateDdlCount: number };
}).constructor;

describe('ensureQuestionnaireSchemaOnce (T000406)', () => {
  beforeEach(() => {
    __resetSchemaInitCacheForTests();
    CountingPool.questionnaireCreateDdlCount = 0;
  });

  it('issues the questionnaire schema CREATE DDL on first call', async () => {
    await ensureQuestionnaireSchemaOnce(pool as never);
    expect(CountingPool.questionnaireCreateDdlCount).toBe(1);
  });

  it('runs the schema DDL at most once across repeated sequential calls', async () => {
    await ensureQuestionnaireSchemaOnce(pool as never);
    await ensureQuestionnaireSchemaOnce(pool as never);
    await ensureQuestionnaireSchemaOnce(pool as never);
    // ensureSchemaOnce memoises the init promise → DDL emitted exactly once.
    expect(CountingPool.questionnaireCreateDdlCount).toBe(1);
  });

  it('runs the schema DDL at most once under concurrent callers', async () => {
    await Promise.all([
      ensureQuestionnaireSchemaOnce(pool as never),
      ensureQuestionnaireSchemaOnce(pool as never),
      ensureQuestionnaireSchemaOnce(pool as never),
      ensureQuestionnaireSchemaOnce(pool as never),
    ]);
    expect(CountingPool.questionnaireCreateDdlCount).toBe(1);
  });
});
