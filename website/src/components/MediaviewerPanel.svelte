<script lang="ts">
  import { buildSetVideosMessage, parseOutbound, type HostOutbound } from '../lib/mediaviewer-bridge';
  import type { HelpVideo } from '../lib/help-videos';

  let {
    mediaviewerHost,
    videos = [],
    onSelect,
    onProgress,
    onEnded,
    onError,
  }: {
    mediaviewerHost: string;
    videos?: HelpVideo[];
    onSelect?: (id: string) => void;
    onProgress?: (sec: number) => void;
    onEnded?: (id: string) => void;
    onError?: (id: string, message: string) => void;
  } = $props();

  const widgetOrigin = $derived(`https://${mediaviewerHost}`);
  const embedSrc = $derived(`${widgetOrigin}/embed.html`);

  let iframeEl = $state<HTMLIFrameElement | null>(null);

  function pushVideos() {
    iframeEl?.contentWindow?.postMessage(buildSetVideosMessage(videos), widgetOrigin);
  }

  function dispatch(msg: HostOutbound) {
    switch (msg.type) {
      case 'select': onSelect?.(msg.id); return;
      case 'progress': onProgress?.(msg.sec); return;
      case 'ended': onEnded?.(msg.id); return;
      case 'error': onError?.(msg.id, msg.message); return;
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
</script>

<div class="mv-panel">
  <iframe
    bind:this={iframeEl}
    src={embedSrc}
    title="Mediaviewer"
    allow="autoplay; fullscreen; picture-in-picture"
    onload={pushVideos}
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
