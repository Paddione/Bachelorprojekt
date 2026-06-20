<script lang="ts">
  import { buildSetVideosMessage, buildSetModeMessage, buildSetGrillingDataMessage, parseOutbound, type HostOutbound } from '../lib/mediaviewer-bridge';
  import type { HelpVideo } from '../lib/help-videos';
  import type { GrillingSessionData } from '../lib/tickets/final-grilling';
  import SessionsListView from './SessionsListView.svelte';
  import SessionsHistory from './sessions/SessionsHistory.svelte';

  let sessionsTab = $state<'active' | 'history'>('active');

  let {
    mediaviewerHost,
    videos = [],
    mode = 'video',
    defaultView = 'sessions',
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
    mode?: 'video' | 'grilling' | 'brainstorm' | 'idle';
    defaultView?: 'sessions' | 'empty';
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
  let embedUrl = $state<string | null>(null);

  const currentSessionType = $derived(grillingData?.questionnaireId ?? 'grilling');

  function broadcastSession(payload: Record<string, unknown>) {
    // Layer 1 — BroadcastChannel (cross-tab). Fail-soft: not all runtimes/jsdom have it.
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('session-events');
        ch.postMessage(payload);
        ch.close();
      }
    } catch { /* fail-soft: cross-tab broadcast is best-effort */ }
    // Layer 2 — same-page CustomEvent for Svelte components on this page.
    try {
      window.dispatchEvent(new CustomEvent('session:event', { detail: payload }));
    } catch { /* fail-soft */ }
  }

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
      case 'grillingAnswer':
        broadcastSession({ type: 'grillingAnswer', sessionType: currentSessionType, questionId: msg.questionId, answer: msg.answer });
        onGrillingAnswer?.(msg.questionId, msg.answer);
        return;
      case 'grillingDismiss':
        broadcastSession({ type: 'grillingDismiss', sessionType: currentSessionType, questionId: msg.questionId });
        onGrillingDismiss?.(msg.questionId);
        return;
      case 'grillingComplete':
        broadcastSession({ type: 'grillingComplete', sessionType: currentSessionType, answers: msg.answers });
        onGrillingComplete?.(msg.answers);
        return;
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

  $effect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ url: string }>).detail;
      if (detail?.url) embedUrl = detail.url;
    };
    window.addEventListener('mediaviewer:open-session', onOpen);
    return () => window.removeEventListener('mediaviewer:open-session', onOpen);
  });
</script>

<div class="mv-panel">
  {#if embedUrl}
    <iframe src={embedUrl} title="Session" allow="fullscreen"></iframe>
  {:else if mode === 'idle' && defaultView === 'sessions'}
    <div class="idle-sessions-container">
      <div class="tabs">
        <button
          type="button"
          class="tab-btn"
          class:active={sessionsTab === 'active'}
          onclick={() => sessionsTab = 'active'}
        >
          Aktive Sessions
        </button>
        <button
          type="button"
          class="tab-btn"
          class:active={sessionsTab === 'history'}
          onclick={() => sessionsTab = 'history'}
        >
          History
        </button>
      </div>
      {#if sessionsTab === 'active'}
        <SessionsListView />
      {:else}
        <SessionsHistory />
      {/if}
    </div>
  {:else}
    <iframe
      bind:this={iframeEl}
      src={embedSrc}
      title="Mediaviewer"
      allow="autoplay; fullscreen; picture-in-picture"
      onload={() => { pushMode(); pushVideos(); pushGrillingData(); }}
    ></iframe>
  {/if}
</div>

<style>
  .mv-panel {
    flex: 1;
    display: flex;
    min-height: 0;
    background: #0b111c;
  }
  .idle-sessions-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #0f172a;
    color: #f8fafc;
    padding: 1rem;
    overflow-y: auto;
  }
  .tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid #334155;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }
  .tab-btn {
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.95rem;
    border-radius: 4px;
    transition: all 0.2s;
  }
  .tab-btn:hover {
    color: #f8fafc;
    background: #1e293b;
  }
  .tab-btn.active {
    color: #38bdf8;
    background: #1e293b;
  }
  iframe {
    flex: 1;
    width: 100%;
    height: 100%;
    border: 0;
  }
</style>
