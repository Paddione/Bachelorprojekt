import { describe, it, expect } from 'vitest';
import { defaultCaptureFrame } from './capture-frame';

describe('defaultCaptureFrame', () => {
  it('is a function with (src, timeSec) signature', () => {
    expect(typeof defaultCaptureFrame).toBe('function');
    expect(defaultCaptureFrame.length).toBe(2);
  });

  it('returns a promise', () => {
    const result = defaultCaptureFrame('about:blank', 0);
    expect(result).toBeInstanceOf(Promise);
  });
});
