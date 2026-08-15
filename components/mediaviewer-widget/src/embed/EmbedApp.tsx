import { useEffect, useRef, useState } from 'react';
import { MediaviewerWidget } from '../MediaviewerWidget';
import { createInboundHandler, emitEvent, type OutboundMessage, type GrillingSessionData } from './bridge';
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
  const [mode, setMode] = useState<'video' | 'grilling'>('video');
  const [grillingData, setGrillingData] = useState<GrillingSessionData | null>(null);

  const post = (msg: OutboundMessage) => window.parent?.postMessage(msg, '*');

  useEffect(() => {
    const handler = createInboundHandler({
      getHandle: () => ref.current,
      setVideos,
      setMode: (m) => setMode(m),
      setGrillingData: (d) => setGrillingData(d),
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
        mode={mode}
        grillingData={grillingData}
        onSelect={(id) => emitEvent(post, { type: 'select', id })}
        onEnded={(id) => emitEvent(post, { type: 'ended', id })}
        onError={(id, message) => emitEvent(post, { type: 'error', id, message })}
        onGrillingAnswer={(questionId, answer) => emitEvent(post, { type: 'grillingAnswer', questionId, answer })}
        onGrillingDismiss={(questionId) => emitEvent(post, { type: 'grillingDismiss', questionId })}
        onGrillingComplete={(answers) => emitEvent(post, { type: 'grillingComplete', answers })}
      />
    </div>
  );
}
