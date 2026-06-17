import type { MediaviewerHandle, VideoSource } from '@videovault-player';

export interface GrillingQuestionData {
  id: string;
  label: string;
  section?: string;
}

export interface GrillingSessionData {
  ticketId: string;
  questionnaireId: string;
  questions: GrillingQuestionData[];
  hints: Record<string, string>;
  suggestions: Record<string, string[]>;
  existingAnswers: Record<string, string>;
  assets: Array<{ name: string; url: string; type: string }>;
}

export type InboundMessage =
  | { type: 'setVideos'; videos: VideoSource[] }
  | { type: 'playVideo'; id: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; sec: number }
  | { type: 'setMode'; mode: 'video' | 'grilling'; ticketId?: string }
  | { type: 'setGrillingData'; data: GrillingSessionData };

export type OutboundMessage =
  | { type: 'select'; id: string }
  | { type: 'progress'; sec: number }
  | { type: 'ended'; id: string }
  | { type: 'error'; id: string; message: string }
  | { type: 'grillingAnswer'; questionId: string; answer: string }
  | { type: 'grillingDismiss'; questionId: string }
  | { type: 'grillingComplete'; answers: Record<string, string> };

export interface BridgeDeps {
  getHandle: () => MediaviewerHandle | null;
  setVideos: (videos: VideoSource[]) => void;
  setMode: (mode: 'video' | 'grilling', ticketId?: string) => void;
  setGrillingData: (data: GrillingSessionData) => void;
  post: (msg: OutboundMessage) => void;
  allowedOrigins: string[];
}

function isInbound(data: unknown): data is InboundMessage {
  return typeof data === 'object' && data !== null && typeof (data as { type?: unknown }).type === 'string';
}

export function createInboundHandler(deps: BridgeDeps): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (!deps.allowedOrigins.includes(event.origin)) return;
    const data = event.data;
    if (!isInbound(data)) return;
    const handle = deps.getHandle();
    switch (data.type) {
      case 'setVideos':
        deps.setVideos(data.videos);
        return;
      case 'playVideo':
        handle?.playVideo(data.id);
        return;
      case 'play':
        handle?.play();
        return;
      case 'pause':
        handle?.pause();
        return;
      case 'seek':
        handle?.seek(data.sec);
        return;
      case 'setMode':
        deps.setMode(data.mode, data.ticketId);
        return;
      case 'setGrillingData':
        deps.setGrillingData(data.data);
        return;
    }
  };
}

export function emitEvent(post: (msg: OutboundMessage) => void, msg: OutboundMessage): void {
  post(msg);
}
