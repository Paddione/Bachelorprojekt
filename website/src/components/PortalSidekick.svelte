<script lang="ts">
  import type { HelpContext } from '../lib/helpContent';
  import SidekickHeader from './assistant/SidekickHeader.svelte';
  import SidekickHome from './assistant/SidekickHome.svelte';
  import SupportView from './assistant/SupportView.svelte';
  import QuestionnaireView from './assistant/QuestionnaireView.svelte';
  import HelpView from './assistant/HelpView.svelte';
  import TicketSidekickView from './assistant/TicketSidekickView.svelte';
  import InboxSidekickView from './assistant/InboxSidekickView.svelte';
  import AgentGuideView from './assistant/AgentGuideView.svelte';
  import PipelineSidekickView from './assistant/PipelineSidekickView.svelte';
  import MediaviewerPanel from './MediaviewerPanel.svelte';
  import { resolveHelpVideos } from '../lib/help-videos';
  import { parseNavigateEvent, shouldShowLearnDot } from '../lib/assistant/sidekick-nudge';

  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'pipeline' | 'agent-guide' | 'mediaviewer';

  let {
    helpSection = '',
    helpContext = 'portal' as HelpContext,
    mediaviewerHost = 'mediaviewer.localhost',
    videovaultHost = 'videovault.localhost',
  }: {
    helpSection?: string;
    helpContext?: HelpContext;
    mediaviewerHost?: string;
    videovaultHost?: string;
  } = $props();

  let open = $state(false);
  let expanded = $state(false);
  let view = $state<View>('home');
  let pendingQuestionnaires = $state(0);
  let pendingTickets = $state(0);
  const mediaviewerVideos = $derived(resolveHelpVideos(videovaultHost));
  let inboxPending = $state(0);
  let isMobile = $state(false);

  // Summary-driven nudge (fail-soft: stays null if the fetch fails → no badge/dot).
  let learningSummary = $state<{ done: number; total: number; pct: number } | null>(null);
  let pendingJump = $state<string | null>(null);
  // FAB attention dot: derive from the pure helper + the local drawer-open state.
  // hasNumericBadge mirrors the FAB badge condition so the dot never doubles up with a count.
  const showLearnDot = $derived(
    !open &&
    shouldShowLearnDot(
      learningSummary,
      helpContext,
      pendingQuestionnaires > 0 || pendingTickets > 0 || inboxPending > 0,
    )
  );

  // User identity for header / avatar
  let userGivenName = $state('');
  let userFamilyName = $state('');
  let userAvailable = $state(true);

  const STANDARD_WIDTH = 380;
  const EXPANDED_WIDTH = 640;

  const drawerWidth = $derived(
    isMobile ? Math.min(window?.innerWidth ?? 380, 420) : (expanded ? EXPANDED_WIDTH : STANDARD_WIDTH)
  );

  const titleMap: Record<View, string> = {
    home: 'Sidekick',
    support: 'Feedback & Support',
    questionnaire: 'Fragebögen',
    help: 'Hilfe',
    tickets: 'Anfragen',
    inbox: 'Postfach',
    pipeline: 'Pipeline',
    'agent-guide': 'Agent-Anleitung',
    mediaviewer: 'Mediaviewer',
  };

  $effect(() => {
    checkMobile();
    const handler = () => checkMobile();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  });

  function checkMobile() {
    isMobile = window.innerWidth < 768;
  }

  $effect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json() as {
          authenticated: boolean;
          user?: { givenName?: string; familyName?: string };
        };
        if (!data.authenticated) return;

        userGivenName = data.user?.givenName ?? '';
        userFamilyName = data.user?.familyName ?? '';

        try {
          const sRes = await fetch('/api/portal/learning/summary');
          if (sRes.ok) {
            const s = await sRes.json() as { done?: number; total?: number; pct?: number };
            learningSummary = { done: s.done ?? 0, total: s.total ?? 0, pct: s.pct ?? 0 };
          }
        } catch { /* fail-soft: no badge/banner */ }

        const qRes = await fetch('/api/portal/questionnaires');
        if (qRes.ok) {
          const qs = await qRes.json() as Array<{ status: string }>;
          pendingQuestionnaires = Array.isArray(qs)
            ? qs.filter(q => !['submitted', 'reviewed', 'dismissed', 'archived'].includes(q.status)).length
            : 0;
        }

        if (helpContext === 'admin') {
          try {
            const tRes = await fetch('/api/admin/tickets?limit=1&status=open', { credentials: 'same-origin' });
            if (tRes.ok) {
              const td = await tRes.json() as { total?: number };
              pendingTickets = td.total ?? 0;
            }
          } catch { /* badge stays 0 */ }

          try {
            const iRes = await fetch('/api/admin/inbox/count', { credentials: 'same-origin' });
            if (iRes.ok) {
              const id = await iRes.json() as { total?: number };
              inboxPending = id.total ?? 0;
            }
          } catch { /* badge stays 0 */ }
        }
      } catch { /* widget is optional */ }
    })();
  });

  $effect(() => {
    const refresh = async () => {
      try {
        const r = await fetch('/api/portal/learning/summary');
        if (r.ok) {
          const s = await r.json() as { done?: number; total?: number; pct?: number };
          learningSummary = { done: s.done ?? 0, total: s.total ?? 0, pct: s.pct ?? 0 };
        }
      } catch { /* fail-soft */ }
    };
    window.addEventListener('learning:updated', refresh);
    return () => window.removeEventListener('learning:updated', refresh);
  });

  $effect(() => {
    const onNavigate = (e: Event) => {
      const intent = parseNavigateEvent((e as CustomEvent).detail);
      if (!intent) return;                       // defensive: ignore unknown/invalid
      open = true;
      view = intent.view;
      pendingJump = intent.jumpTo;
    };
    window.addEventListener('sidekick:navigate', onNavigate);
    return () => window.removeEventListener('sidekick:navigate', onNavigate);
  });

  function openDrawer() { open = true; view = 'home'; }
  function closeDrawer() { open = false; }
  function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && open) closeDrawer(); }
  function navigate(v: View) { pendingJump = null; view = v; }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Backdrop for mobile -->
{#if open && isMobile}
  <div
    class="backdrop"
    role="button"
    tabindex="0"
    aria-label="Sidekick schließen"
    onclick={closeDrawer}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeDrawer(); }}
  ></div>
{/if}

<!-- FAB trigger -->
<button
  class="fab"
  class:fab--open={open}
  onclick={open ? closeDrawer : openDrawer}
  aria-label={open ? 'Sidekick schließen' : 'Sidekick öffnen'}
  aria-expanded={open}
>
  {#if (pendingQuestionnaires > 0 || pendingTickets > 0 || inboxPending > 0) && !open}
    <span class="fab-badge">{Math.min(99, pendingQuestionnaires + pendingTickets + inboxPending)}</span>
  {/if}
  {#if showLearnDot}
    <span class="fab-dot" aria-hidden="true"></span>
  {/if}
  {#if open}
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13"/>
    </svg>
  {:else}
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">
      <path d="M8 2.5a4 4 0 0 0-4 4c0 2.5-1.5 3.5-1.5 3.5h11S12 9 12 6.5a4 4 0 0 0-4-4z"/>
      <path d="M7 13.5h2"/>
    </svg>
  {/if}
</button>

<!-- Drawer -->
<div
  class="drawer"
  role="dialog"
  aria-modal="true"
  aria-label="Sidekick"
  aria-hidden={!open}
  inert={!open}
  style="width: {drawerWidth}px; transform: translateX({open ? '0' : '100%'});"
>
  <!-- Ambient halo overlays -->
  <div class="halo halo--warm" aria-hidden="true"></div>
  <div class="halo halo--cool" aria-hidden="true"></div>

  <!-- Grain noise layer -->
  <svg class="grain" aria-hidden="true">
    <filter id="sk-grain-f">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .45 0"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#sk-grain-f)"/>
  </svg>

  <SidekickHeader
    title={titleMap[view]}
    onClose={closeDrawer}
    onBack={view !== 'home' ? () => { view = 'home'; } : undefined}
    {expanded}
    onToggleExpand={!isMobile ? () => { expanded = !expanded; } : undefined}
    available={userAvailable}
  />

  <div class="drawer-body">
    {#if view === 'home'}
      <SidekickHome
        onNavigate={navigate}
        onClose={closeDrawer}
        {pendingQuestionnaires}
        {helpSection}
        {helpContext}
        {pendingTickets}
        pendingInbox={inboxPending}
        summary={learningSummary}
      />
    {:else if view === 'support'}
      <SupportView onCloseView={() => { view = 'home'; }} />
    {:else if view === 'questionnaire'}
      <QuestionnaireView onCloseView={() => { view = 'home'; }} />
    {:else if view === 'help'}
      <HelpView section={helpSection} context={helpContext} />
    {:else if view === 'agent-guide'}
      <AgentGuideView jumpTo={pendingJump} />
    {:else if view === 'tickets'}
      <TicketSidekickView onClose={closeDrawer} />
    {:else if view === 'inbox'}
      <InboxSidekickView onClose={closeDrawer} />
    {:else if view === 'pipeline'}
      <PipelineSidekickView onClose={closeDrawer} />
    {:else if view === 'mediaviewer'}
      <MediaviewerPanel {mediaviewerHost} videos={mediaviewerVideos} />
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 9045;
    background: rgba(0, 0, 0, 0.5);
  }

  .fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9040;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: oklch(0.83 0.09 75);
    color: #0b111c;
    border: 1.5px solid oklch(0.83 0.09 75 / 0.4);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px oklch(0.83 0.09 75 / 0.25), 0 2px 8px rgba(0,0,0,0.4);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .fab:hover {
    transform: scale(1.07);
    box-shadow: 0 6px 28px oklch(0.83 0.09 75 / 0.35), 0 4px 16px rgba(0,0,0,0.4);
  }
  .fab--open {
    background: #1a2235;
    color: oklch(0.83 0.09 75);
    border-color: oklch(0.83 0.09 75 / 0.35);
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }

  .fab-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: oklch(0.83 0.09 75);
    color: #0b111c;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 5px;
    font-family: var(--font-mono, 'Geist Mono', monospace);
    min-width: 18px;
    text-align: center;
    line-height: 1.4;
    pointer-events: none;
    box-shadow: 0 0 0 2px #0f1623;
  }

  .fab-dot {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: oklch(0.83 0.09 75);
    box-shadow: 0 0 0 2px #0f1623;
    pointer-events: none;
  }

  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 9050;
    background: #0f1623;
    border-left: 1px solid rgba(232, 200, 112, 0.12);
    box-shadow: -8px 0 40px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s ease-out;
    overflow: hidden;
    max-width: 100vw;
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    position: relative;
    z-index: 1;
  }

  /* Ambient halos */
  .halo {
    position: absolute;
    border-radius: 999px;
    pointer-events: none;
    z-index: 0;
  }
  .halo--warm {
    right: -10%;
    top: 5%;
    width: 340px;
    height: 340px;
    background: radial-gradient(circle at center, rgba(232,200,112,.16), transparent 65%);
    filter: blur(60px);
    transform: translate(50%, -50%);
  }
  .halo--cool {
    left: -10%;
    bottom: 8%;
    width: 280px;
    height: 280px;
    background: radial-gradient(circle at center, rgba(70,110,180,.12), transparent 65%);
    filter: blur(50px);
    transform: translate(-50%, 50%);
  }

  /* Grain noise overlay */
  .grain {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0.45;
    mix-blend-mode: overlay;
    z-index: 0;
  }

  @media (max-width: 767px) {
    .drawer {
      width: 100vw !important;
      max-width: 420px !important;
    }
  }
</style>
