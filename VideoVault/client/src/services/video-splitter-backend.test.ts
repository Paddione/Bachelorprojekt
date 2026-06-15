import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api-client', () => ({
  ApiClient: { post: vi.fn() },
  HttpError: class HttpError extends Error { constructor(public status: number) { super('http'); } },
}));
vi.mock('./file-handle-registry', () => ({
  FileHandleRegistry: { get: vi.fn() },
}));
vi.mock('./video-splitter', () => ({
  VideoSplitter: { splitVideo: vi.fn() },
}));

import { ApiClient, HttpError } from './api-client';
import { FileHandleRegistry } from './file-handle-registry';
import { serverSplitterBackend, selectSplitterBackend, wasmSplitterBackend } from './video-splitter-backend';
import type { Video } from '@/types/video';
import type { SplitVideoOptions } from './video-splitter';

const video = { id: 'v1', path: 'movies/clip.mp4', rootKey: 'root-a' } as Video;
const options = { splitTimeSeconds: 10, first: {} as any, second: {} as any } as SplitVideoOptions;

beforeEach(() => {
  vi.mocked(ApiClient.post).mockReset();
  vi.mocked(FileHandleRegistry.get).mockReset();
});

describe('selectSplitterBackend', () => {
  it('uses the WASM backend when a local FSAA handle exists', () => {
    vi.mocked(FileHandleRegistry.get).mockReturnValue({} as any);
    expect(selectSplitterBackend(video)).toBe(wasmSplitterBackend);
  });

  it('uses the server backend when no local handle exists', () => {
    vi.mocked(FileHandleRegistry.get).mockReturnValue(undefined);
    expect(selectSplitterBackend(video)).toBe(serverSplitterBackend);
  });
});

describe('serverSplitterBackend', () => {
  it('POSTs to /api/videos/:id/split and returns the result verbatim', async () => {
    vi.mocked(ApiClient.post).mockResolvedValue({ success: true, segments: [{}, {}] } as any);
    const res = await serverSplitterBackend.split(video, options);
    expect(ApiClient.post).toHaveBeenCalledWith('/api/videos/v1/split', expect.objectContaining({
      sourcePath: 'movies/clip.mp4', rootKey: 'root-a', splitTimeSeconds: 10,
    }));
    expect(res.success).toBe(true);
  });

  it('maps an HttpError to a failure result instead of throwing', async () => {
    vi.mocked(ApiClient.post).mockRejectedValue(new (HttpError as any)(500));
    const res = await serverSplitterBackend.split(video, options);
    expect(res).toEqual({ success: false, message: expect.stringContaining('500'), code: 'ffmpeg_failed' });
  });
});
