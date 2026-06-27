import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import {
  insertJob, setJobPromptId, updateJobStatus, updateJobStage, getJob, listRecentJobs,
} from './generation-jobs';

beforeEach(() => query.mockReset());

describe('generation-jobs', () => {
  it('insertJob returns the new UUID and writes an INSERT to assets.generation_jobs', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'job-1' }] });
    expect(await insertJob('hero.glb')).toBe('job-1');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO assets\.generation_jobs/);
    expect(params).toEqual(['hero.glb']);
  });

  it('setJobPromptId stores the prompt id and flips status to pending', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await setJobPromptId('job-1', 'p-1');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/UPDATE assets\.generation_jobs/);
    expect(sql).toMatch(/status = 'pending'/);
    expect(params).toEqual(['p-1', 'job-1']);
  });

  it('updateJobStatus maps a normal status through COALESCE for skin_id and error_msg', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await updateJobStatus('job-1', 'running');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/UPDATE assets\.generation_jobs/);
    expect(sql).toMatch(/COALESCE\(\$2, skin_id\)/);
    expect(params).toEqual(['running', null, null, 'job-1']);
  });

  it('updateJobStage maps done → status=done and error → status=error', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await updateJobStage('job-1', 'done');
    const paramsDone = query.mock.calls[0][1] as unknown[];
    expect(paramsDone[1]).toBe('done');

    query.mockResolvedValueOnce({ rows: [] });
    await updateJobStage('job-1', 'error', { error_msg: 'pipeline fail' });
    const paramsErr = query.mock.calls[1][1] as unknown[];
    expect(paramsErr[1]).toBe('error');
    expect(paramsErr[3]).toBe('pipeline fail');
  });

  it('getJob returns the row or null when missing', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'job-1', name: 'hero' }] });
    expect(await getJob('job-1')).toEqual({ id: 'job-1', name: 'hero' });
    query.mockResolvedValueOnce({ rows: [] });
    expect(await getJob('missing')).toBeNull();
  });

  it('listRecentJobs sends a LIMIT and returns the rows', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }] });
    const out = await listRecentJobs(2);
    expect(out).toHaveLength(2);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params).toEqual([2]);
  });
});
