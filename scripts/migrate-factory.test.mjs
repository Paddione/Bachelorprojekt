import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrations, ALREADY_EXISTS_SQLSTATES } from './migrate-factory.mjs';

let tmpDir;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'migrate-factory-test-'));
  mkdirSync(join(tmpDir, 'empty'));
  mkdirSync(join(tmpDir, 'lex'));
  mkdirSync(join(tmpDir, 'tracked'));
  mkdirSync(join(tmpDir, 'backfill'));
  mkdirSync(join(tmpDir, 'real-error'));

  writeFileSync(join(tmpDir, 'lex', '20260703_b.sql'), 'CREATE TABLE b (id int);');
  writeFileSync(join(tmpDir, 'lex', '20260520_a.sql'), 'CREATE TABLE a (id int);');
  writeFileSync(join(tmpDir, 'lex', 'error-log-schema.test.ts'), 'not-a-sql-file');

  writeFileSync(join(tmpDir, 'tracked', '20260520_a.sql'), 'CREATE TABLE a (id int);');
  writeFileSync(join(tmpDir, 'tracked', '20260703_b.sql'), 'CREATE TABLE b (id int);');

  writeFileSync(join(tmpDir, 'backfill', '20260520_a.sql'), 'CREATE TABLE IF NOT EXISTS already_exists_test (id int);');
  writeFileSync(join(tmpDir, 'backfill', '20260703_b.sql'), 'CREATE TABLE b (id int);');

  writeFileSync(join(tmpDir, 'real-error', '20260520_a.sql'), 'SELECT invalid-syntax; -- 20260520_a.sql');
  writeFileSync(join(tmpDir, 'real-error', '20260703_b.sql'), 'CREATE TABLE b (id int);');
});

after(() => {
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function createMockPool(opts = {}) {
  const tracked = opts.tracked ?? [];
  const failOn = opts.failOn ?? {};
  const calls = [];

  const query = async (sql, params) => {
    calls.push({ sql, params });

    if (/^SELECT filename FROM public\.factory_schema_migrations/.test(sql)) {
      return { rows: tracked.map((filename) => ({ filename })) };
    }

    for (const [filename, err] of Object.entries(failOn)) {
      if (sql.includes(filename)) {
        const e = new Error(err.message);
        e.code = err.code;
        throw e;
      }
    }

    return { rows: [] };
  };

  const release = () => {};
  let released = false;
  const connect = async () => {
    released = false;
    return {
      query,
      release: () => { released = true; },
    };
  };

  return { query, connect, calls, get released() { return released; } };
}

test('applies files in lexicographic sort order and ignores non-.sql entries', async () => {
  const pool = createMockPool();
  await runMigrations(pool, { migrationsDir: join(tmpDir, 'lex') });

  const migrationQueries = pool.calls
    .filter((c) => c.sql === 'CREATE TABLE a (id int);' || c.sql === 'CREATE TABLE b (id int);')
    .map((c) => c.sql);
  assert.equal(migrationQueries.length, 2);
  assert.equal(migrationQueries[0], 'CREATE TABLE a (id int);');
  assert.equal(migrationQueries[1], 'CREATE TABLE b (id int);');
});

test('skips already-tracked files and only runs untracked ones', async () => {
  const pool = createMockPool({ tracked: ['20260520_a.sql'] });
  await runMigrations(pool, { migrationsDir: join(tmpDir, 'tracked') });

  const inserts = pool.calls.filter((c) =>
    c.sql.startsWith('INSERT INTO public.factory_schema_migrations'),
  );
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].params[0], '20260703_b.sql');
});

for (const code of ['42P07', '42710', '42701']) {
  test(`backfills a file that fails with ${code} (already exists) and continues to the next file`, async () => {
    const pool = createMockPool({
      failOn: { '20260520_a.sql': { code, message: 'already exists' } },
    });

    await assert.doesNotReject(
      runMigrations(pool, { migrationsDir: join(tmpDir, 'backfill') }),
    );
    assert.ok(ALREADY_EXISTS_SQLSTATES.has(code));

    const inserts = pool.calls.filter((c) =>
      c.sql.startsWith('INSERT INTO public.factory_schema_migrations'),
    );
    const insertedFiles = inserts.map((c) => c.params[0]);
    assert.ok(insertedFiles.includes('20260520_a.sql'));
    assert.ok(insertedFiles.includes('20260703_b.sql'));
  });
}

test('aborts on a real error outside the allowlist and does not track the file', async () => {
  const pool = createMockPool({
    failOn: { '20260520_a.sql': { code: '42601', message: 'syntax error' } },
  });

  await assert.rejects(
    runMigrations(pool, { migrationsDir: join(tmpDir, 'real-error') }),
    /20260520_a\.sql.*syntax error/s,
  );

  const inserts = pool.calls.filter((c) =>
    c.sql.startsWith('INSERT INTO public.factory_schema_migrations'),
  );
  assert.equal(inserts.length, 0);
});

test('bootstraps public.factory_schema_migrations before the tracking SELECT', async () => {
  const pool = createMockPool();

  await runMigrations(pool, { migrationsDir: join(tmpDir, 'empty') });

  const firstCall = pool.calls[0];
  assert.ok(
    /CREATE TABLE IF NOT EXISTS public\.factory_schema_migrations/.test(firstCall.sql),
  );
  const selectIndex = pool.calls.findIndex((c) =>
    /^SELECT filename FROM public\.factory_schema_migrations/.test(c.sql),
  );
  assert.ok(selectIndex > 0);
});

test('runs the whole pass on a single dedicated client', async () => {
  let connectCount = 0;
  let releaseCount = 0;
  const pool = {
    connect: async () => {
      connectCount++;
      return {
        query: async () => ({ rows: [] }),
        release: () => { releaseCount++; },
      };
    },
  };

  await runMigrations(pool, { migrationsDir: join(tmpDir, 'empty') });

  assert.equal(connectCount, 1);
  assert.equal(releaseCount, 1);
});
