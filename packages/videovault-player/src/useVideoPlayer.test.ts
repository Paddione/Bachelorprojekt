import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoPlayer } from './useVideoPlayer';
import type { VideoSource } from './types';

const mockVideos: VideoSource[] = [
  { id: 'v1', url: 'https://example.com/1.mp4', title: 'Video 1', duration: 100 },
  { id: 'v2', url: 'https://example.com/2.mp4', title: 'Video 2', duration: 200 },
  { id: 'v3', url: 'https://example.com/3.mp4', title: 'Video 3', duration: 300 },
];

describe('useVideoPlayer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts at the first entry in the playlist', () => {
    const { result } = renderHook(() =>
      useVideoPlayer({ playlist: mockVideos })
    );
    expect(result.current.current?.id).toBe('v1');
    expect(result.current.current?.title).toBe('Video 1');
  });

  it('respects initialVideoId', () => {
    const { result } = renderHook(() =>
      useVideoPlayer({ playlist: mockVideos, initialVideoId: 'v2' })
    );
    expect(result.current.current?.id).toBe('v2');
  });

  it('playVideo selects from playlist and fires onSelect', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useVideoPlayer({ playlist: mockVideos, onSelect })
    );

    act(() => {
      result.current.controls.playVideo('v3');
    });

    expect(result.current.current?.id).toBe('v3');
    expect(onSelect).toHaveBeenCalledWith(mockVideos[2]);
  });

  it('playVideo ignores unknown ids', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useVideoPlayer({ playlist: mockVideos, onSelect })
    );

    act(() => {
      result.current.controls.playVideo('unknown');
    });

    expect(result.current.current?.id).toBe('v1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('next/prev navigate in the playlist', () => {
    const { result } = renderHook(() =>
      useVideoPlayer({ playlist: mockVideos, initialVideoId: 'v2' })
    );

    expect(result.current.current?.id).toBe('v2');

    act(() => {
      result.current.controls.next();
    });
    expect(result.current.current?.id).toBe('v3');

    act(() => {
      result.current.controls.prev();
    });
    expect(result.current.current?.id).toBe('v2');

    act(() => {
      result.current.controls.prev();
    });
    expect(result.current.current?.id).toBe('v1');

    act(() => {
      result.current.controls.prev();
    });
    expect(result.current.current?.id).toBe('v1');
  });

  it('persists volume and rate in localStorage', () => {
    const { result } = renderHook(() =>
      useVideoPlayer({ playlist: mockVideos })
    );

    act(() => {
      result.current.controls.setVolume(0.5);
    });
    expect(localStorage.getItem('vv.player.volume')).toBe('0.5');

    act(() => {
      result.current.controls.setRate(1.5);
    });
    expect(localStorage.getItem('vv.player.speed')).toBe('1.5');
  });

  it('onEnded fires with current video id', () => {
    const onEnded = vi.fn();
    const { result } = renderHook(() =>
      useVideoPlayer({ playlist: mockVideos, onEnded })
    );

    act(() => {
      result.current.videoHandlers.onEnded();
    });

    expect(onEnded).toHaveBeenCalledWith('v1');
  });

  it('setPlaylist replaces list and keeps current id if still present', () => {
    const { result } = renderHook(() =>
      useVideoPlayer({ playlist: mockVideos, initialVideoId: 'v2' })
    );

    const newList: VideoSource[] = [
      { id: 'v2', url: 'https://example.com/2b.mp4', title: 'Video 2b', duration: 150 },
      { id: 'v4', url: 'https://example.com/4.mp4', title: 'Video 4', duration: 400 },
    ];

    act(() => {
      result.current.controls.setPlaylist(newList);
    });

    expect(result.current.current?.id).toBe('v2');
    expect(result.current.current?.url).toBe('https://example.com/2b.mp4');

    act(() => {
      result.current.controls.setPlaylist(mockVideos);
    });

    expect(result.current.current?.id).toBe('v2');
  });
});
