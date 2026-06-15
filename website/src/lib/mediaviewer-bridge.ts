import type { HelpVideo } from './help-videos';

export type HostInbound =
  | { type: 'setVideos'; videos: HelpVideo[] }
  | { type: 'playVideo'; id: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; sec: number };

export type HostOutbound =
  | { type: 'select'; id: string }
  | { type: 'progress'; sec: number }
  | { type: 'ended'; id: string }
  | { type: 'error'; id: string; message: string };

export function buildSetVideosMessage(videos: HelpVideo[]): HostInbound {
  return { type: 'setVideos', videos };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function parseOutbound(data: unknown): HostOutbound | null {
  if (!isRecord(data) || typeof data.type !== 'string') return null;
  switch (data.type) {
    case 'select':
      return typeof data.id === 'string' ? { type: 'select', id: data.id } : null;
    case 'ended':
      return typeof data.id === 'string' ? { type: 'ended', id: data.id } : null;
    case 'progress':
      return typeof data.sec === 'number' ? { type: 'progress', sec: data.sec } : null;
    case 'error':
      return typeof data.id === 'string' && typeof data.message === 'string'
        ? { type: 'error', id: data.id, message: data.message }
        : null;
    default:
      return null;
  }
}
