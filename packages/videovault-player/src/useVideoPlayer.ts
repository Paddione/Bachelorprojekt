import React, { useState, useRef, useCallback } from 'react';
import type {
  VideoSource,
  PlayerState,
  UseVideoPlayerOptions,
  PlayerControls,
  VideoEventHandlers,
  UseVideoPlayerReturn,
} from './types';

const STORAGE_KEY_VOLUME = 'vv.player.volume';
const STORAGE_KEY_SPEED = 'vv.player.speed';

function loadPersistedNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) return n;
    }
  } catch {}
  return fallback;
}

export function useVideoPlayer(
  options: UseVideoPlayerOptions & { playlist: VideoSource[]; videoRef?: React.RefObject<HTMLVideoElement | null> }
): UseVideoPlayerReturn {
  const { playlist: initialPlaylist, initialVideoId, onSelect, onEnded, onError, videoRef: externalRef } = options;
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = externalRef || internalRef;
  const [playlist, setPlaylistState] = useState<VideoSource[]>(initialPlaylist);
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (initialVideoId) {
      const idx = initialPlaylist.findIndex((v) => v.id === initialVideoId);
      if (idx >= 0) return idx;
    }
    return 0;
  });
  const [state, setState] = useState<PlayerState>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => loadPersistedNumber(STORAGE_KEY_VOLUME, 1));
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(() => loadPersistedNumber(STORAGE_KEY_SPEED, 1));
  const [buffered, setBuffered] = useState(0);

  const current = playlist[currentIndex] ?? null;

  const applyVolume = useCallback((v: number) => {
    if (videoRef.current) {
      videoRef.current.volume = v;
    }
  }, []);

  const applyRate = useCallback((r: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = r;
    }
  }, []);

  const play = useCallback(() => {
    if (videoRef.current) {
      void videoRef.current.play();
    }
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        void videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    applyVolume(clamped);
    if (clamped > 0) setIsMuted(false);
    try { localStorage.setItem(STORAGE_KEY_VOLUME, String(clamped)); } catch {}
  }, [applyVolume]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (videoRef.current) {
        videoRef.current.volume = next ? 0 : volume;
      }
      return next;
    });
  }, [volume]);

  const setRate = useCallback((r: number) => {
    setPlaybackRateState(r);
    applyRate(r);
    try { localStorage.setItem(STORAGE_KEY_SPEED, String(r)); } catch {}
  }, [applyRate]);

  const next = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, playlist.length - 1));
  }, [playlist.length]);

  const prev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const playVideo = useCallback((id: string) => {
    const idx = playlist.findIndex((v) => v.id === id);
    if (idx < 0) return;
    setCurrentIndex(idx);
    if (onSelect) onSelect(playlist[idx]);
  }, [playlist, onSelect]);

  const setPlaylist = useCallback((videos: VideoSource[], initialId?: string) => {
    setPlaylistState(videos);
    if (initialId) {
      const idx = videos.findIndex((v) => v.id === initialId);
      if (idx >= 0) {
        setCurrentIndex(idx);
        return;
      }
    }
    setCurrentIndex((prev) => {
      const currentId = playlist[prev]?.id;
      if (currentId) {
        const idx = videos.findIndex((v) => v.id === currentId);
        if (idx >= 0) return idx;
      }
      return 0;
    });
  }, [playlist]);

  const handleTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const d = e.currentTarget.duration;
    setDuration(Number.isFinite(d) ? d : 0);
  }, []);

  const handleProgress = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    try {
      const ranges = el.buffered;
      if (ranges.length === 0) { setBuffered(0); return; }
      let end = 0;
      const t = el.currentTime;
      for (let i = 0; i < ranges.length; i++) {
        const startI = ranges.start(i);
        const endI = ranges.end(i);
        if (t >= startI && t <= endI) { end = endI; break; }
        if (endI > end) end = endI;
      }
      setBuffered(end);
    } catch { setBuffered(0); }
  }, []);

  const handlePlay = useCallback(() => {
    setState('playing');
    if (navigator.mediaSession) {
      try { navigator.mediaSession.playbackState = 'playing'; } catch {}
    }
  }, []);

  const handlePause = useCallback(() => {
    setState('paused');
    if (navigator.mediaSession) {
      try { navigator.mediaSession.playbackState = 'paused'; } catch {}
    }
  }, []);

  const handleEnded = useCallback(() => {
    setState('ended');
    if (current) {
      onEnded?.(current.id);
    }
  }, [current, onEnded]);

  const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const err = e.currentTarget.error;
    const messages: Record<number, string> = {
      1: 'Playback aborted',
      2: 'Network error',
      3: 'Decoding error',
      4: 'Source not supported',
    };
    const msg = messages[err?.code ?? 0] || 'Unknown playback error';
    setState('error');
    if (current) {
      onError?.(current.id, msg);
    }
  }, [current, onError]);

  const controls: PlayerControls = {
    play,
    pause,
    toggle,
    seek,
    setVolume,
    toggleMute,
    setRate,
    next,
    prev,
    playVideo,
    setPlaylist,
  };

  const videoHandlers: VideoEventHandlers = {
    onTimeUpdate: handleTimeUpdate,
    onLoadedMetadata: handleLoadedMetadata,
    onProgress: handleProgress,
    onPlay: handlePlay,
    onPause: handlePause,
    onEnded: handleEnded,
    onError: handleError,
  };

  return {
    videoRef,
    current,
    state,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    buffered,
    controls,
    videoHandlers,
  };
}
