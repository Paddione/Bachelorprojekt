import { describe, it, expect } from 'vitest';
import { buildSetVideosMessage, parseOutbound } from './mediaviewer-bridge';
import type { HelpVideo } from './help-videos';

const videos: HelpVideo[] = [{ id: 'v1', url: 'https://x/v.mp4', title: 'T', duration: 10 }];

describe('buildSetVideosMessage', () => {
  it('wraps videos in the inbound setVideos envelope', () => {
    expect(buildSetVideosMessage(videos)).toEqual({ type: 'setVideos', videos });
  });
});

describe('parseOutbound', () => {
  it('accepts a well-formed select message', () => {
    expect(parseOutbound({ type: 'select', id: 'v1' })).toEqual({ type: 'select', id: 'v1' });
  });
  it('accepts progress with a numeric sec', () => {
    expect(parseOutbound({ type: 'progress', sec: 4.2 })).toEqual({ type: 'progress', sec: 4.2 });
  });
  it('accepts an error message', () => {
    expect(parseOutbound({ type: 'error', id: 'v1', message: 'boom' })).toEqual({ type: 'error', id: 'v1', message: 'boom' });
  });
  it('returns null for unknown types', () => {
    expect(parseOutbound({ type: 'setVideos', videos: [] })).toBeNull();
    expect(parseOutbound({ foo: 'bar' })).toBeNull();
    expect(parseOutbound(null)).toBeNull();
    expect(parseOutbound('select')).toBeNull();
  });
  it('returns null when required fields are missing/mistyped', () => {
    expect(parseOutbound({ type: 'select' })).toBeNull();
    expect(parseOutbound({ type: 'progress', sec: 'x' })).toBeNull();
    expect(parseOutbound({ type: 'error', id: 'v1' })).toBeNull();
  });
});
