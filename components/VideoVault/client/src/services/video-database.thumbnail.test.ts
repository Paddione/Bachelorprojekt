import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoDatabase } from './video-database';
import type { Video } from '@/types/video';
import { serverHealth } from './server-health';
import { ApiClient } from './api-client';

function makeVideo(overrides?: Partial<Video>): Video {
  return {
    id: 'vid1',
    filename: 'sample.mp4',
    displayName: 'Sample',
    path: 'root/sample.mp4',
    size: 1234,
    lastModified: new Date().toISOString(),
    categories: { age: [], physical: [], ethnicity: [], relationship: [], acts: [], setting: [], quality: [], performer: [] },
    customCategories: {},
    metadata: { duration: 10, width: 1920, height: 1080, bitrate: 0, codec: 'H.264', fps: 30, aspectRatio: '16:9' },
    thumbnail: { dataUrl: 'data:image/jpeg;base64,AAA', generated: true, timestamp: new Date().toISOString() },
    ...overrides,
  };
}

describe('VideoDatabase server sync includes thumbnails', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('bulk upsert sends thumbnail dataUrl to server', async () => {
    vi.spyOn(serverHealth, 'isHealthy').mockResolvedValue(true);
    const postSpy = vi.spyOn(ApiClient, 'post').mockResolvedValue({ upserted: 1 } as any);

    const v = makeVideo();
    VideoDatabase.addVideos([], [v]);

    // allow any microtasks to flush
    await Promise.resolve();

    expect(postSpy).toHaveBeenCalled();
    const payload = postSpy.mock.calls[0][1];
    expect(payload.videos[0].thumbnail.dataUrl).toBe('data:image/jpeg;base64,AAA');
  });
});
