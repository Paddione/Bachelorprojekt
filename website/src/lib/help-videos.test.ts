import { describe, it, expect } from 'vitest';
import { HelpVideoSchema, loadHelpVideos } from './help-videos';

describe('HelpVideoSchema', () => {
  it('accepts a minimal valid video (vendored VideoSource shape)', () => {
    const ok = HelpVideoSchema.safeParse({ id: 'v1', url: 'https://x/v.mp4', title: 'T', duration: 12 });
    expect(ok.success).toBe(true);
  });

  it('rejects posterUrl/durationSec (wrong field names from the spec draft)', () => {
    const bad = HelpVideoSchema.safeParse({ id: 'v1', url: 'https://x/v.mp4', title: 'T', posterUrl: 'p', durationSec: 12 });
    // duration is required → fails even though extra keys are stripped
    expect(bad.success).toBe(false);
  });

  it('requires a non-empty id, url and title', () => {
    expect(HelpVideoSchema.safeParse({ id: '', url: 'https://x', title: 'T', duration: 1 }).success).toBe(false);
  });
});

describe('loadHelpVideos', () => {
  it('parses the shipped manifest into a typed array', () => {
    const videos = loadHelpVideos();
    expect(Array.isArray(videos)).toBe(true);
    expect(videos.length).toBeGreaterThan(0);
    for (const v of videos) {
      expect(typeof v.id).toBe('string');
      expect(typeof v.url).toBe('string');
      expect(typeof v.duration).toBe('number');
    }
  });
});
