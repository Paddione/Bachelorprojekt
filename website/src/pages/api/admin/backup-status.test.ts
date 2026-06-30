import { describe, it, expect, vi, beforeEach } from 'vitest';
import { derivePipelineStatus, pickLatest } from './backup-status';

interface PipelineJob {
  name: string;
  startTime: string | null;
  completionTime: string | null;
  succeeded: boolean;
  failed: boolean;
  active: boolean;
}

vi.mock('../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));

import { getSession, isAdmin } from '../../../lib/auth';
import { GET } from './backup-status';

function makeJob(overrides: Partial<PipelineJob> = {}): PipelineJob {
  return {
    name: 'db-backup-123',
    startTime: '2026-06-17T10:00:00Z',
    completionTime: '2026-06-17T10:05:00Z',
    succeeded: true,
    failed: false,
    active: false,
    ...overrides,
  };
}

describe('pickLatest', () => {
  it('returns null for empty array', () => {
    expect(pickLatest([])).toBeNull();
  });

  it('returns the only job', () => {
    const jobs = [makeJob()];
    expect(pickLatest(jobs)?.name).toBe('db-backup-123');
  });

  it('picks job with latest startTime', () => {
    const jobs = [
      makeJob({ name: 'old', startTime: '2026-06-16T10:00:00Z' }),
      makeJob({ name: 'new', startTime: '2026-06-17T12:00:00Z' }),
    ];
    expect(pickLatest(jobs)?.name).toBe('new');
  });

  it('falls back to completionTime when startTime is null', () => {
    const jobs = [
      makeJob({ name: 'a', startTime: null, completionTime: '2026-06-16T10:00:00Z' }),
      makeJob({ name: 'b', startTime: '2026-06-17T12:00:00Z', completionTime: null }),
    ];
    expect(pickLatest(jobs)?.name).toBe('b');
  });
});

describe('derivePipelineStatus', () => {
  const now = new Date('2026-06-17T14:00:00Z');
  const cronjob = { spec: { schedule: '0 2 * * *' } };

  it('returns gray when no jobs', () => {
    const status = derivePipelineStatus([], cronjob, now, 48);
    expect(status.light).toBe('gray');
    expect(status.lastRun).toBeNull();
    expect(status.schedule).toBe('0 2 * * *');
  });

  it('returns green for fresh succeeded job', () => {
    const jobs = [makeJob({
      startTime: '2026-06-17T10:00:00Z',
      completionTime: '2026-06-17T10:05:00Z',
      succeeded: true,
    })];
    const status = derivePipelineStatus(jobs, cronjob, now, 48);
    expect(status.light).toBe('green');
    expect(status.succeeded).toBe(1);
    expect(status.lastSuccessfulUpload).toBe('2026-06-17T10:05:00Z');
  });

  it('returns yellow for stale succeeded job', () => {
    const jobs = [makeJob({
      startTime: '2026-06-14T10:00:00Z',
      completionTime: '2026-06-14T10:05:00Z',
      succeeded: true,
    })];
    const status = derivePipelineStatus(jobs, cronjob, now, 48);
    expect(status.light).toBe('yellow');
  });

  it('returns red for latest failed job with no recent success', () => {
    const jobs = [makeJob({
      startTime: '2026-06-17T10:00:00Z',
      completionTime: '2026-06-17T10:05:00Z',
      succeeded: false,
      failed: true,
    })];
    const status = derivePipelineStatus(jobs, cronjob, now, 48);
    expect(status.light).toBe('red');
    expect(status.failed).toBe(1);
  });

  it('returns yellow for active job without recent success', () => {
    const jobs = [makeJob({
      startTime: '2026-06-17T13:30:00Z',
      completionTime: null,
      succeeded: false,
      failed: false,
      active: true,
    })];
    const status = derivePipelineStatus(jobs, cronjob, now, 48);
    expect(status.light).toBe('yellow');
    expect(status.active).toBe(1);
  });

  it('prefers green over gray when mixed jobs and latest is succeeded+fresh', () => {
    const jobs = [
      makeJob({ name: 'old-fail', startTime: '2026-06-15T10:00:00Z', completionTime: '2026-06-15T10:05:00Z', succeeded: false, failed: true }),
      makeJob({ name: 'fresh-ok', startTime: '2026-06-17T10:00:00Z', completionTime: '2026-06-17T10:05:00Z', succeeded: true, failed: false }),
    ];
    const status = derivePipelineStatus(jobs, cronjob, now, 48);
    expect(status.light).toBe('green');
  });

  it('sets schedule from cronjob', () => {
    const jobs = [makeJob()];
    const status = derivePipelineStatus(jobs, cronjob, now, 48);
    expect(status.schedule).toBe('0 2 * * *');
  });

  it('sets schedule to null when cronjob is null', () => {
    const jobs = [makeJob()];
    const status = derivePipelineStatus(jobs, null, now, 48);
    expect(status.schedule).toBeNull();
  });
});

describe('GET /api/admin/backup-status', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
    vi.mocked(isAdmin).mockReset();
  });

  it('returns 401 without session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const req = new Request('http://x/api/admin/backup-status');
    const res = await GET({ request: req } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-admin', async () => {
    vi.mocked(getSession).mockResolvedValue({ sub: 'u1' } as never);
    vi.mocked(isAdmin).mockReturnValue(false);
    const req = new Request('http://x/api/admin/backup-status');
    const res = await GET({ request: req } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });
});
