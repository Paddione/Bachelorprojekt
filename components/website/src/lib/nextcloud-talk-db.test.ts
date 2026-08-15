import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { Pool, query } = vi.hoisted(() => {
  const queue: Array<{ rows: unknown[] } | Error> = [];
  const query = vi.fn(async (..._args: unknown[]) => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (next) return next;
    return { rows: [] };
  });
  class Pool {
    constructor(_opts: unknown) { /* ignore config */ }
    query(...a: unknown[]) { return query(...a); }
  }
  return { Pool, query, queue };
});
vi.mock('pg', () => ({ default: { Pool }, Pool }));

const loggerError = vi.hoisted(() => vi.fn());
vi.mock('./logger', () => ({ logger: { error: loggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { listActiveCallRooms, ensureBrettBotEnabledForRoom } from './nextcloud-talk-db';

beforeEach(() => {
  query.mockClear();
  loggerError.mockClear();
});

describe('listActiveCallRooms', () => {
  it('returns [] and logs when NEXTCLOUD_DB_PASSWORD is not set', async () => {
    const original = process.env.NEXTCLOUD_DB_PASSWORD;
    delete process.env.NEXTCLOUD_DB_PASSWORD;
    vi.resetModules();
    const mod = await import('./nextcloud-talk-db');
    const rows = await mod.listActiveCallRooms();
    expect(rows).toEqual([]);
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('NEXTCLOUD_DB_PASSWORD'));
    if (original === undefined) delete process.env.NEXTCLOUD_DB_PASSWORD;
    else process.env.NEXTCLOUD_DB_PASSWORD = original;
  });
});

describe('listActiveCallRooms (with password configured)', () => {
  const original = process.env.NEXTCLOUD_DB_PASSWORD;

  beforeEach(() => {
    process.env.NEXTCLOUD_DB_PASSWORD = 'secret';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXTCLOUD_DB_PASSWORD;
    else process.env.NEXTCLOUD_DB_PASSWORD = original;
  });

  it('maps rows into ActiveCallRoom, defaulting displayName to token when name is empty', async () => {
    vi.resetModules();
    query.mockClear();
    query.mockImplementationOnce(async () => ({
      rows: [
        { token: 'tok-1', name: 'Standup', active_since: new Date('2026-07-01T09:00:00Z') },
        { token: 'tok-2', name: null, active_since: null },
      ],
    }));
    const mod = await import('./nextcloud-talk-db');
    const rooms = await mod.listActiveCallRooms();
    expect(rooms).toHaveLength(2);
    expect(rooms[0]).toMatchObject({ token: 'tok-1', name: 'Standup', displayName: 'Standup' });
    expect(rooms[1]).toMatchObject({ token: 'tok-2', name: '', displayName: 'tok-2', activeSince: null });
  });

  it('returns [] and logs on query error', async () => {
    vi.resetModules();
    query.mockClear();
    loggerError.mockClear();
    query.mockImplementationOnce(async () => { throw new Error('db down'); });
    const mod = await import('./nextcloud-talk-db');
    const rooms = await mod.listActiveCallRooms();
    expect(rooms).toEqual([]);
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('listActiveCallRooms failed'),
    );
  });
});

describe('ensureBrettBotEnabledForRoom', () => {
  const original = process.env.NEXTCLOUD_DB_PASSWORD;

  beforeEach(() => {
    process.env.NEXTCLOUD_DB_PASSWORD = 'secret';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXTCLOUD_DB_PASSWORD;
    else process.env.NEXTCLOUD_DB_PASSWORD = original;
  });

  it('returns false and logs when the brett bot is not found', async () => {
    vi.resetModules();
    query.mockClear();
    loggerError.mockClear();
    query.mockImplementationOnce(async () => ({ rows: [] })); // getBrettBotId lookup
    const mod = await import('./nextcloud-talk-db');
    const ok = await mod.ensureBrettBotEnabledForRoom('room-token');
    expect(ok).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('brett bot not found'));
  });

  it('inserts the conversation row and returns true when the bot exists', async () => {
    vi.resetModules();
    query.mockClear();
    query.mockImplementationOnce(async () => ({ rows: [{ id: '42' }] })); // getBrettBotId lookup
    query.mockImplementationOnce(async () => ({ rows: [] })); // insert
    const mod = await import('./nextcloud-talk-db');
    const ok = await mod.ensureBrettBotEnabledForRoom('room-token');
    expect(ok).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    const insertCall = query.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO oc_talk_bots_conversation/);
    expect(insertCall[1]).toEqual([42, 'room-token']);
  });

  it('returns false and logs when getBrettBotId lookup throws', async () => {
    vi.resetModules();
    query.mockClear();
    loggerError.mockClear();
    query.mockImplementationOnce(async () => { throw new Error('lookup failed'); });
    const mod = await import('./nextcloud-talk-db');
    const ok = await mod.ensureBrettBotEnabledForRoom('room-token');
    expect(ok).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('getBrettBotId failed'),
    );
  });

  it('returns false and logs when the insert query throws', async () => {
    vi.resetModules();
    query.mockClear();
    loggerError.mockClear();
    query.mockImplementationOnce(async () => ({ rows: [{ id: '42' }] })); // getBrettBotId lookup
    query.mockImplementationOnce(async () => { throw new Error('insert failed'); });
    const mod = await import('./nextcloud-talk-db');
    const ok = await mod.ensureBrettBotEnabledForRoom('room-token');
    expect(ok).toBe(false);
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('ensureBrettBotEnabledForRoom failed'),
    );
  });
});

// Unused imports kept for type-checking parity with the module's exported surface.
void listActiveCallRooms;
void ensureBrettBotEnabledForRoom;
