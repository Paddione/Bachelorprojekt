import { describe, it, expect } from 'vitest';
import { detectQualityCategories } from './movie-handler';

describe('detectQualityCategories', () => {
  it('detects 8k', () => {
    expect(detectQualityCategories({ width: 7680, height: 4320, fps: 30 })).toEqual(['8k']);
  });

  it('detects 4k', () => {
    expect(detectQualityCategories({ width: 3840, height: 2160, fps: 30 })).toEqual(['4k']);
  });

  it('detects 2k', () => {
    expect(detectQualityCategories({ width: 2560, height: 1440, fps: 24 })).toEqual(['2k']);
  });

  it('detects 1080p', () => {
    expect(detectQualityCategories({ width: 1920, height: 1080, fps: 30 })).toEqual(['1080p']);
  });

  it('detects 720p', () => {
    expect(detectQualityCategories({ width: 1280, height: 720, fps: 25 })).toEqual(['720p']);
  });

  it('detects 480p for low resolution', () => {
    expect(detectQualityCategories({ width: 854, height: 480, fps: 30 })).toEqual(['480p']);
  });

  it('detects 1080p + 60fps', () => {
    const q = detectQualityCategories({ width: 1920, height: 1080, fps: 60 });
    expect(q).toContain('1080p');
    expect(q).toContain('60fps');
  });

  it('detects 4k + 60fps', () => {
    const q = detectQualityCategories({ width: 3840, height: 2160, fps: 59.94 });
    expect(q).toContain('4k');
    expect(q).toContain('60fps');
  });

  it('handles portrait orientation (height > width)', () => {
    const q = detectQualityCategories({ width: 1080, height: 1920, fps: 30 });
    expect(q).toContain('1080p');
  });

  it('handles zero dimensions', () => {
    expect(detectQualityCategories({ width: 0, height: 0, fps: 0 })).toEqual([]);
  });

  it('fps at boundary (50) counts as 60fps', () => {
    const q = detectQualityCategories({ width: 1920, height: 1080, fps: 50 });
    expect(q).toContain('60fps');
  });

  it('fps below boundary (49) does not add 60fps', () => {
    const q = detectQualityCategories({ width: 1920, height: 1080, fps: 49 });
    expect(q).not.toContain('60fps');
  });
});
