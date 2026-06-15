import { useEffect, useRef, useState } from 'react';
import { MediaviewerWidget } from '../MediaviewerWidget';
import { createInboundHandler, emitEvent, type OutboundMessage } from './bridge';
import type { MediaviewerHandle, VideoSource } from '@videovault-player';
import '@videovault-player/player.css';
import '../styles/mediaviewer.css';

const ALLOWED = (import.meta.env.VITE_ALLOWED_PARENT_ORIGINS ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

export function EmbedApp() {
  const ref = useRef<MediaviewerHandle>(null);
  const [videos, setVideos] = useState<VideoSource[]>([]);

  const post = (msg: OutboundMessage) => window.parent?.postMessage(msg, '*');

  useEffect(() => {
    const handler = createInboundHandler({
      getHandle: () => ref.current,
      setVideos,
      post,
      allowedOrigins: ALLOWED,
    });
    window.addEventListener('message', handler);
    post({ type: 'progress', sec: 0 });
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div style={{ height: '100vh' }}>
      <MediaviewerWidget
        ref={ref}
        videos={videos}
        onSelect={(id) => emitEvent(post, { type: 'select', id })}
        onEnded={(id) => emitEvent(post, { type: 'ended', id })}
        onError={(id, message) => emitEvent(post, { type: 'error', id, message })}
      />
    </div>
  );
}
