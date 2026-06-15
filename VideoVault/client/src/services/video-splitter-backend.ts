import { Video } from '@/types/video';
import { VideoSplitter, type SplitVideoOptions, type SplitVideoResult } from './video-splitter';

export interface VideoSplitterBackend {
  kind: 'wasm' | 'server';
  split: (video: Video, options: SplitVideoOptions) => Promise<SplitVideoResult>;
}

export const wasmSplitterBackend: VideoSplitterBackend = {
  kind: 'wasm',
  split: (video, options) => VideoSplitter.splitVideo(video, options),
};

// Future: server-side split backend
// export const serverSplitterBackend: VideoSplitterBackend = { ... };

export const activeSplitterBackend: VideoSplitterBackend = wasmSplitterBackend;
