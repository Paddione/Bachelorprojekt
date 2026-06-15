import { Video } from '@/types/video';
import { VideoSplitter, type SplitVideoOptions, type SplitVideoResult } from './video-splitter';
import { ApiClient, HttpError } from './api-client';
import { FileHandleRegistry } from './file-handle-registry';

export interface VideoSplitterBackend {
  kind: 'wasm' | 'server';
  split: (video: Video, options: SplitVideoOptions) => Promise<SplitVideoResult>;
}

export const wasmSplitterBackend: VideoSplitterBackend = {
  kind: 'wasm',
  split: (video, options) => VideoSplitter.splitVideo(video, options),
};

export const serverSplitterBackend: VideoSplitterBackend = {
  kind: 'server',
  async split(video, options) {
    try {
      return await ApiClient.post<SplitVideoResult>(`/api/videos/${video.id}/split`, {
        sourcePath: video.path,
        rootKey: video.rootKey,
        splitTimeSeconds: options.splitTimeSeconds,
        first: options.first,
        second: options.second,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        return { success: false, message: `Server split failed (${err.status})`, code: 'ffmpeg_failed' };
      }
      return { success: false, message: err instanceof Error ? err.message : 'Server split failed' };
    }
  },
};

/**
 * Wählt das Schneide-Backend pro Video:
 * - Lokaler FSAA-FileHandle vorhanden → lokal via WASM schneiden (kein Server nötig).
 * - Kein Handle (server-resident / Movie-Mode) → serverseitiges ffmpeg.
 */
export function selectSplitterBackend(video: Video): VideoSplitterBackend {
  return FileHandleRegistry.get(video.id) ? wasmSplitterBackend : serverSplitterBackend;
}

// Rückwärtskompatibler Default (WASM). Aufrufer sollen selectSplitterBackend(video) nutzen.
export const activeSplitterBackend: VideoSplitterBackend = wasmSplitterBackend;
