import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/path-resolver', () => ({
  resolveInputPath: vi.fn(),
}));
vi.mock('./movie-handler', () => ({
  extractMovieMetadata: vi.fn(),
}));
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockRejectedValue(new Error('ENOENT')),
    stat: vi.fn().mockResolvedValue({ size: 123, mtime: new Date('2026-01-01T00:00:00Z') }),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

import { resolveInputPath } from '../lib/path-resolver';
import { extractMovieMetadata } from './movie-handler';
import { spawn } from 'child_process';
import { splitVideoOnServer, type ServerSplitParams } from './split-handler';

function fakeFfmpegOk() {
  return {
    stderr: { on: vi.fn() },
    on: (event: string, cb: (code?: number) => void) => {
      if (event === 'close') cb(0);
    },
  } as any;
}

const META = { duration: 100, width: 1920, height: 1080, bitrate: 5000, codec: 'h264', fps: 30, aspectRatio: '16:9', fileSize: 123 };

const baseParams: ServerSplitParams = {
  sourceId: 'src1',
  sourcePath: 'movies/clip.mp4',
  rootKey: 'root-a',
  splitTimeSeconds: 42,
  first: { displayName: 'Part 1', filename: 'part1.mp4', categories: {} as any, customCategories: {} },
  second: { displayName: 'Part 2', filename: 'part2.mp4', categories: {} as any, customCategories: {} },
};

beforeEach(() => {
  vi.mocked(resolveInputPath).mockReset();
  vi.mocked(extractMovieMetadata).mockReset();
  vi.mocked(spawn).mockReset();
});

describe('splitVideoOnServer', () => {
  it('returns not_server_resident when the source path cannot be resolved', async () => {
    vi.mocked(resolveInputPath).mockResolvedValue(null);
    const res = await splitVideoOnServer(baseParams, undefined);
    expect(res).toEqual({ success: false, message: expect.any(String), code: 'not_server_resident' });
  });

  it('rejects a split time outside the valid window', async () => {
    vi.mocked(resolveInputPath).mockResolvedValue('/media/movies/clip.mp4');
    vi.mocked(extractMovieMetadata).mockResolvedValue({ ...META, duration: 10 });
    const res = await splitVideoOnServer({ ...baseParams, splitTimeSeconds: 9.99 }, undefined);
    expect(res).toEqual({ success: false, message: expect.any(String), code: 'invalid_split' });
  });

  it('produces two segment records on success with -c copy', async () => {
    vi.mocked(resolveInputPath).mockResolvedValue('/media/movies/clip.mp4');
    vi.mocked(extractMovieMetadata).mockResolvedValue(META);
    vi.mocked(spawn).mockImplementation(() => fakeFfmpegOk());

    const res = await splitVideoOnServer(baseParams, undefined);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.segments).toHaveLength(2);
    expect(res.segments[0].displayName).toBe('Part 1');
    expect(res.segments[1].filename).toBe('part2.mp4');
    const firstArgs = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(firstArgs).toContain('-c');
    expect(firstArgs).toContain('copy');
    expect(firstArgs).toContain('-t');
    const secondArgs = vi.mocked(spawn).mock.calls[1][1] as string[];
    expect(secondArgs).toContain('-ss');
  });
});

describe('splitVideoOnServer — path traversal hardening', () => {
  beforeEach(() => {
    vi.mocked(resolveInputPath).mockResolvedValue('/media/src.mp4');
    vi.mocked(extractMovieMetadata).mockResolvedValue(META as any);
  });

  it('rejects a first.filename containing a path separator / traversal', async () => {
    const params: ServerSplitParams = {
      ...baseParams,
      first: { ...baseParams.first, filename: '../../evil.mp4' },
    };
    const result = await splitVideoOnServer(params, undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('invalid_split');
  });

  it('rejects a second.filename that is an absolute path', async () => {
    const params: ServerSplitParams = {
      ...baseParams,
      second: { ...baseParams.second, filename: '/etc/cron.d/x.mp4' },
    };
    const result = await splitVideoOnServer(params, undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('invalid_split');
  });
});
