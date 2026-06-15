import type { RefObject } from 'react';

export interface VideoSource {
  id: string;
  url: string;
  poster?: string;
  title: string;
  duration: number;
  /** Read-only Anzeige; später vom Companion gefüllt. */
  tags?: string[];
}

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface MediaviewerHandle {
  playVideo: (id: string) => void;
  setPlaylist: (videos: VideoSource[], initialId?: string) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  getState: () => { current: VideoSource | null; state: PlayerState; currentTime: number };
}

export type CaptureFrameFn = (src: string, timeSec: number) => Promise<string>;

export interface UseVideoPlayerOptions {
  initialVideoId?: string;
  onSelect?: (video: VideoSource) => void;
  onEnded?: (videoId: string) => void;
  onError?: (videoId: string, error: string) => void;
}

export interface PlayerControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setRate: (rate: number) => void;
  next: () => void;
  prev: () => void;
  playVideo: (id: string) => void;
  setPlaylist: (videos: VideoSource[], initialId?: string) => void;
}

export interface VideoEventHandlers {
  onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onProgress: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onError: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
}

export interface UseVideoPlayerReturn {
  videoRef: RefObject<HTMLVideoElement | null>;
  current: VideoSource | null;
  state: PlayerState;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  buffered: number;
  controls: PlayerControls;
  videoHandlers: VideoEventHandlers;
}

export interface VideoPlayerProps {
  source: VideoSource | null;
  playlist?: VideoSource[];
  captureFrame?: CaptureFrameFn;
  showControls?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onSelect?: (video: VideoSource) => void;
  onEnded?: (videoId: string) => void;
  onError?: (videoId: string, error: string) => void;
  onStateChange?: (state: PlayerState) => void;
}

export interface MediaviewerWidgetProps {
  videos: VideoSource[];
  onSelect: (videoId: string) => void;
  onEnded?: (videoId: string) => void;
  onError?: (videoId: string, error: string) => void;
}
