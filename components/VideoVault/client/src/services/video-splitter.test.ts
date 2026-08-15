import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoSplitter } from './video-splitter';

describe('VideoSplitter guard tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns missing_handle when no file handle is registered', async () => {
    const video = {
      id: 'v1',
      filename: 'test.mp4',
      displayName: 'test',
      path: '/test.mp4',
      size: 1000,
      lastModified: new Date().toISOString(),
      categories: { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] },
      customCategories: {},
      metadata: { duration: 100, width: 0, height: 0, bitrate: 0, codec: 'h264', fps: 30, aspectRatio: '16:9' },
      thumbnail: { dataUrl: '', generated: false, timestamp: '' },
      rootKey: 'root1',
    } as any;

    const result = await VideoSplitter.splitVideo(video, {
      splitTimeSeconds: 30,
      first: { displayName: 'A', filename: 'a', categories: { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] }, customCategories: {} },
      second: { displayName: 'B', filename: 'b', categories: { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] }, customCategories: {} },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('missing_handle');
    }
  });
});
