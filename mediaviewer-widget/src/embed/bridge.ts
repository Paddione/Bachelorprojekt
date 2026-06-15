import type { MediaviewerHandle, VideoSource } from '@videovault-player';

export type InboundMessage =
  | { type: 'setVideos'; videos: VideoSource[] }
  | { type: 'playVideo'; id: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; sec: number };

export type OutboundMessage =
  | { type: 'select'; id: string }
  | { type: 'progress'; sec: number }
  | { type: 'ended'; id: string }
  | { type: 'error'; id: string; message: string };

export interface BridgeDeps {
  getHandle: () => MediaviewerHandle | null;
  setVideos: (videos: VideoSource[]) => void;
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
    }
  };
}

export function emitEvent(post: (msg: OutboundMessage) => void, msg: OutboundMessage): void {
  post(msg);
}
