<script lang="ts">
  import { buildSetVideosMessage, buildSetModeMessage, buildSetGrillingDataMessage, parseOutbound, type HostOutbound } from '../lib/mediaviewer-bridge';
  import type { HelpVideo } from '../lib/help-videos';
  import type { GrillingSessionData } from '../lib/tickets/final-grilling';

  let {
    mediaviewerHost,
    videos = [],
    mode = 'video',
    grillingData = null,
    onSelect,
    onProgress,
    onEnded,
    onError,
    onGrillingAnswer,
    onGrillingDismiss,
    onGrillingComplete,
  }: {
    mediaviewerHost: string;
    videos?: HelpVideo[];
    mode?: 'video' | 'grilling';
    grillingData?: GrillingSessionData | null;
    onSelect?: (id: string) => void;
    onProgress?: (sec: number) => void;
    onEnded?: (id: string) => void;
    onError?: (id: string, message: string) => void;
    onGrillingAnswer?: (questionId: string, answer: string) => void;
    onGrillingDismiss?: (questionId: string) => void;
    onGrillingComplete?: (answers: Record<string, string>) => void;
  } = $props();

  const widgetOrigin = $derived(`https://${mediaviewerHost}`);
  // Cache-buster forces a fresh server response, bypassing any browser-cached response
  // that still has the old X-Frame-Options: SAMEORIGIN security header.
  const embedSrc = $derived(`${widgetOrigin}/embed.html?v=${mediaviewerHost}`);

  let iframeEl = $state<HTMLIFrameElement | null>(null);

  function pushVideos() {
    if (mode === 'video') {
      iframeEl?.contentWindow?.postMessage(buildSetVideosMessage(videos), widgetOrigin);
    }
  }

  function pushMode() {
    iframeEl?.contentWindow?.postMessage(buildSetModeMessage(mode, grillingData?.ticketId), widgetOrigin);
  }

  function pushGrillingData() {
    if (grillingData) {
      // JSON round-trip strips the Svelte 5 reactive proxy before postMessage (structuredClone rejects proxies).
      const plain = JSON.parse(JSON.stringify(grillingData));
      iframeEl?.contentWindow?.postMessage(buildSetGrillingDataMessage(plain), widgetOrigin);
    }
  }

  function dispatch(msg: HostOutbound) {
    switch (msg.type) {
      case 'select': onSelect?.(msg.id); return;
      case 'progress': onProgress?.(msg.sec); return;
      case 'ended': onEnded?.(msg.id); return;
      case 'error': onError?.(msg.id, msg.message); return;
      case 'grillingAnswer': onGrillingAnswer?.(msg.questionId, msg.answer); return;
      case 'grillingDismiss': onGrillingDismiss?.(msg.questionId); return;
      case 'grillingComplete': onGrillingComplete?.(msg.answers); return;
    }
  }

  $effect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== widgetOrigin) return;
      if (iframeEl?.contentWindow && e.source && e.source !== iframeEl.contentWindow) return;
      const msg = parseOutbound(e.data);
      if (msg) dispatch(msg);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  });

  $effect(() => {
    void videos;
    pushVideos();
  });

  $effect(() => {
    void mode;
    pushMode();
  });

  $effect(() => {
    void grillingData;
    if (mode === 'grilling') {
      pushGrillingData();
    }
  });
</script>

<div class="mv-panel">
  <iframe
    bind:this={iframeEl}
    src={embedSrc}
    title="Mediaviewer"
    allow="autoplay; fullscreen; picture-in-picture"
    onload={() => { pushMode(); pushVideos(); pushGrillingData(); }}
  ></iframe>
</div>

<style>
  .mv-panel {
    flex: 1;
    display: flex;
    min-height: 0;
    background: #0b111c;
  }
  iframe {
    flex: 1;
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
