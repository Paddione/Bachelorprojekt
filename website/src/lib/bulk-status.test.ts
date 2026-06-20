import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockClient, mockPool } = vi.hoisted(() => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  };
  return { mockClient: client, mockPool: pool };
});

vi.mock('./website-db', () => ({
  pool: mockPool,
}));

import { bulkChangeStatus, undoBulkStatus, MAX_BULK_SELECT } from './bulk-status';

describe('bulkChangeStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws BATCH_LIMIT_EXCEEDED when ids length exceeds MAX_BULK_SELECT', async () => {
    const ids = Array.from({ length: MAX_BULK_SELECT + 1 }, (_, i) => `id-${i}`);
    await expect(
      bulkChangeStatus('mentolder', ids, 'in_progress', { label: 'admin' })
    ).rejects.toThrow('BATCH_LIMIT_EXCEEDED');
  });

  it('transitions tickets successfully, records comments and returns undoToken', async () => {
    // Ticket 1: succeeds
    // Ticket 2: succeeds
    mockClient.query
      // Ticket 1 Tx
      .mockResolvedValueOnce(null) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'backlog' }] }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
      .mockResolvedValueOnce(null) // INSERT Comment
      .mockResolvedValueOnce(null) // COMMIT
      // Ticket 2 Tx
      .mockResolvedValueOnce(null) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'triage' }] }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
      .mockResolvedValueOnce(null) // INSERT Comment
      .mockResolvedValueOnce(null); // COMMIT

    const result = await bulkChangeStatus('mentolder', ['t1', 't2'], 'in_progress', { label: 'admin' });

    expect(result.changed).toEqual([
      { id: 't1', oldStatus: 'backlog' },
      { id: 't2', oldStatus: 'triage' },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.undoToken).toBeDefined();
    expect(result.oldStatuses).toEqual({
      t1: 'backlog',
      t2: 'triage',
    });

    // Check queries
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('handles concurrent changes (guard rowCount=0) by putting them in skipped', async () => {
    mockClient.query
      // Ticket 1: succeeds
      .mockResolvedValueOnce(null) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'backlog' }] }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
      .mockResolvedValueOnce(null) // INSERT Comment
      .mockResolvedValueOnce(null) // COMMIT
      // Ticket 2: concurrent change (UPDATE rowCount = 0)
      .mockResolvedValueOnce(null) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'triage' }] }) // SELECT
      .mockResolvedValueOnce({ rowCount: 0 }) // UPDATE guard fail
      .mockResolvedValueOnce(null); // COMMIT

    const result = await bulkChangeStatus('mentolder', ['t1', 't2'], 'in_progress', { label: 'admin' });

    expect(result.changed).toEqual([{ id: 't1', oldStatus: 'backlog' }]);
    expect(result.skipped).toEqual([
      { id: 't2', oldStatus: 'triage', reason: 'concurrent_change' },
    ]);
    expect(result.failed).toEqual([]);
    expect(result.oldStatuses).toEqual({
      t1: 'backlog',
    });
  });

  it('handles DB errors on individual tickets, rollbacking only failed ones', async () => {
    mockClient.query
      // Ticket 1: succeeds
      .mockResolvedValueOnce(null) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'backlog' }] }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
      .mockResolvedValueOnce(null) // INSERT Comment
      .mockResolvedValueOnce(null) // COMMIT
      // Ticket 2: DB error
      .mockResolvedValueOnce(null) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'triage' }] }) // SELECT
      .mockRejectedValueOnce(new Error('connection timeout')) // UPDATE throws
      .mockResolvedValueOnce(null); // ROLLBACK

    const result = await bulkChangeStatus('mentolder', ['t1', 't2'], 'in_progress', { label: 'admin' });

    expect(result.changed).toEqual([{ id: 't1', oldStatus: 'backlog' }]);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([
      { id: 't2', error: expect.any(Error) },
    ]);
    expect(result.oldStatuses).toEqual({
      t1: 'backlog',
    });
  });
});

describe('undoBulkStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores previous statuses on undo and handles gone tokens', async () => {
    // 1. Generate token by performing bulk status change
    mockClient.query
      .mockResolvedValueOnce(null) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'backlog' }] }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
      .mockResolvedValueOnce(null) // INSERT Comment
      .mockResolvedValueOnce(null); // COMMIT

    const changeResult = await bulkChangeStatus('mentolder', ['t1'], 'in_progress', { label: 'admin' });
    const token = changeResult.undoToken!;

    // 2. Undo
    mockClient.query
      .mockResolvedValueOnce(null) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
      .mockResolvedValueOnce(null); // COMMIT

    const undoResult = await undoBulkStatus(token);
    expect(undoResult.restored).toEqual(['t1']);
    expect(undoResult.failed).toEqual([]);

    // 3. Undo again (should fail because token is consumed/removed or guard fails)
    await expect(undoBulkStatus(token)).rejects.toThrow('Token not found or expired');
  });

  it('expires token after 5 seconds', async () => {
    mockClient.query
      .mockResolvedValueOnce(null) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'backlog' }] }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
      .mockResolvedValueOnce(null) // INSERT Comment
      .mockResolvedValueOnce(null); // COMMIT

    const changeResult = await bulkChangeStatus('mentolder', ['t1'], 'in_progress', { label: 'admin' });
    const token = changeResult.undoToken!;

    // Advance time by 5.1s
    vi.advanceTimersByTime(5100);

    await expect(undoBulkStatus(token)).rejects.toThrow('Token not found or expired');
  });
});
