import { describe, it, expect, vi, beforeEach } from 'vitest';

let poolQuery: ReturnType<typeof vi.fn>;
let clientQuery: ReturnType<typeof vi.fn>;
let clientRelease: ReturnType<typeof vi.fn>;

type PgMock = { poolQuery: ReturnType<typeof vi.fn>; clientQuery: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
type TestGlobals = { __pgMock?: PgMock };
const testGlobals = globalThis as unknown as TestGlobals;

vi.mock('pg', () => {
  const _poolQuery = vi.fn();
  const _clientQuery = vi.fn();
  const _release = vi.fn();
  function Pool(this: { query: ReturnType<typeof vi.fn>; connect: () => Promise<{ query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }> }) {
    this.query = _poolQuery;
    this.connect = async () => ({ query: _clientQuery, release: _release });
    (globalThis as unknown as TestGlobals).__pgMock = { poolQuery: _poolQuery, clientQuery: _clientQuery, release: _release };
  }
  return { default: { Pool } };
});

import {
  readCurrent,
  save,
  restore,
  HomepageValidationError,
  __setTablesReadyForTests,
} from './homepage-blocks-store';

// A minimal valid one-block document.
const validDoc = {
  schemaVersion: 1,
  blocks: [
    {
      id: 'spacer',
      type: 'spacer',
      props: { size: 48 },
    },
  ],
};

beforeEach(() => {
  const m = testGlobals.__pgMock!;
  poolQuery = m.poolQuery;
  clientQuery = m.clientQuery;
  clientRelease = m.release;
  poolQuery.mockReset();
  clientQuery.mockReset();
  clientRelease.mockReset();
  // Skip lazy DDL so the query mocks only see real reads/writes.
  __setTablesReadyForTests();
});

describe('readCurrent', () => {
  it('returns the stored document + version', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ document: validDoc, version: 3 }] });
    const r = await readCurrent('mentolder');
    expect(r).toEqual({ document: validDoc, version: 3 });
  });

  it('returns null document + version 0 when absent', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    expect(await readCurrent('mentolder')).toEqual({ document: null, version: 0 });
  });
});

describe('save', () => {
  it('rejects an invalid payload with HomepageValidationError (before touching the DB)', async () => {
    await expect(save('mentolder', { schemaVersion: 1, blocks: [{ id: 'x', type: 'nope', props: {} }] }, 0, 'gekko'))
      .rejects.toBeInstanceOf(HomepageValidationError);
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('creates version 1 on the first save', async () => {
    // BEGIN
    clientQuery.mockResolvedValueOnce({});
    // liveRead inside txn → no existing doc
    clientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT/UPSERT documents
    clientQuery.mockResolvedValueOnce({});
    // SELECT ids for prune → none
    clientQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    clientQuery.mockResolvedValueOnce({});

    const r = await save('mentolder', validDoc, 0, 'gekko');
    expect(r).toEqual({ version: 1 });
    expect(clientRelease).toHaveBeenCalled();
  });

  it('rejects a stale baseVersion with HomepageConflictError', async () => {
    // BEGIN
    clientQuery.mockResolvedValueOnce({});
    // liveRead → current version is 3
    clientQuery.mockResolvedValueOnce({ rows: [{ document: validDoc, version: 3 }] });
    // ROLLBACK
    clientQuery.mockResolvedValueOnce({});

    await expect(save('mentolder', validDoc, 1, 'gekko'))
      .rejects.toMatchObject({ code: 'CONFLICT', currentVersion: 3 });
  });
});

describe('restore', () => {
  it('writes the snapshot of an old version as a new version', async () => {
    // 1) SELECT snapshot for the target version
    poolQuery.mockResolvedValueOnce({ rows: [{ snapshot: { document: validDoc, version: 1 } }] });
    // 2) readCurrent → current version is 2
    poolQuery.mockResolvedValueOnce({ rows: [{ document: validDoc, version: 2 }] });
    // 3) save() transaction
    clientQuery.mockResolvedValueOnce({}); // BEGIN
    clientQuery.mockResolvedValueOnce({ rows: [{ document: validDoc, version: 2 }] }); // liveRead
    clientQuery.mockResolvedValueOnce({}); // snapshot insert (existing doc)
    clientQuery.mockResolvedValueOnce({}); // upsert documents
    clientQuery.mockResolvedValueOnce({ rows: [] }); // prune ids
    clientQuery.mockResolvedValueOnce({}); // COMMIT

    const r = await restore('mentolder', 42, 'gekko');
    expect(r).toEqual({ version: 3 });
  });

  it('throws when the target version does not exist', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(restore('mentolder', 999, 'gekko')).rejects.toThrow(/not found/i);
  });
});
