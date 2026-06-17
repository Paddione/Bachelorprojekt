import type { HelpVideo } from './help-videos';
import type { GrillingSessionData } from './tickets/final-grilling';

export type HostInbound =
  | { type: 'setVideos'; videos: HelpVideo[] }
  | { type: 'playVideo'; id: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; sec: number }
  | { type: 'setMode'; mode: 'video' | 'grilling'; ticketId?: string }
  | { type: 'setGrillingData'; data: GrillingSessionData };

export type HostOutbound =
  | { type: 'select'; id: string }
  | { type: 'progress'; sec: number }
  | { type: 'ended'; id: string }
  | { type: 'error'; id: string; message: string }
  | { type: 'grillingAnswer'; questionId: string; answer: string }
  | { type: 'grillingDismiss'; questionId: string }
  | { type: 'grillingComplete'; answers: Record<string, string> };

export function buildSetVideosMessage(videos: HelpVideo[]): HostInbound {
  return { type: 'setVideos', videos };
}

export function buildSetModeMessage(mode: 'video' | 'grilling', ticketId?: string): HostInbound {
  return { type: 'setMode', mode, ...(ticketId ? { ticketId } : {}) };
}

export function buildSetGrillingDataMessage(data: GrillingSessionData): HostInbound {
  return { type: 'setGrillingData', data };
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
    case 'grillingAnswer':
      return typeof data.questionId === 'string' && typeof data.answer === 'string'
        ? { type: 'grillingAnswer', questionId: data.questionId, answer: data.answer }
        : null;
    case 'grillingDismiss':
      return typeof data.questionId === 'string'
        ? { type: 'grillingDismiss', questionId: data.questionId }
        : null;
    case 'grillingComplete':
      return typeof data.answers === 'object' && data.answers !== null
        ? { type: 'grillingComplete', answers: data.answers as Record<string, string> }
        : null;
    default:
      return null;
  }
}
