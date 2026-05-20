<script lang="ts">
  import type { HelpContext } from '../lib/helpContent';
  import SidekickHeader from './assistant/SidekickHeader.svelte';
  import SidekickHome from './assistant/SidekickHome.svelte';
  import SupportView from './assistant/SupportView.svelte';
  import QuestionnaireView from './assistant/QuestionnaireView.svelte';
  import HelpView from './assistant/HelpView.svelte';
  import TicketSidekickView from './assistant/TicketSidekickView.svelte';
  import InboxSidekickView from './assistant/InboxSidekickView.svelte';

  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox';

  let {
    helpSection = '',
    helpContext = 'portal' as HelpContext,
  }: {
    helpSection?: string;
    helpContext?: HelpContext;
  } = $props();

  let open = $state(false);
  let expanded = $state(false);
  let view = $state<View>('home');
  let pendingQuestionnaires = $state(0);
  let pendingTickets = $state(0);
  let inboxPending = $state(0);
  let isMobile = $state(false);

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
        const data = await res.json() as { authenticated: boolean };
        if (!data.authenticated) return;
        const qRes = await fetch('/api/portal/questionnaires');
        if (qRes.ok) {
          const qs = await qRes.json() as Array<{ status: string }>;
          pendingQuestionnaires = Array.isArray(qs)
            ? qs.filter(q => q.status !== 'submitted' && q.status !== 'reviewed' && q.status !== 'dismissed' && q.status !== 'archived').length
            : 0;
        }
        if (helpContext === 'admin') {
          try {
            const tRes = await fetch('/api/admin/tickets?limit=1&status=open', { credentials: 'same-origin' });
            if (tRes.ok) {
              const td = await tRes.json() as { total?: number };
              pendingTickets = td.total ?? 0;
            }
          } catch {
            // optional — badge just stays 0
          }
          try {
            const iRes = await fetch('/api/admin/inbox/count', { credentials: 'same-origin' });
            if (iRes.ok) {
              const id = await iRes.json() as { total?: number };
              inboxPending = id.total ?? 0;
            }
          } catch {
            // optional
          }
        }
      } catch {
        // silently ignore — widget is optional
      }
    })();
  });

  function openDrawer() {
    open = true;
    view = 'home';
  }

  function closeDrawer() {
    open = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) closeDrawer();
  }

  function navigate(v: View) {
    view = v;
  }
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
  onclick={open ? closeDrawer : openDrawer}
  aria-label={open ? 'Sidekick schließen' : 'Sidekick öffnen'}
  aria-expanded={open}
>
  {#if (pendingQuestionnaires > 0 || pendingTickets > 0 || inboxPending > 0) && !open}
    <span class="fab-badge">{Math.min(99, pendingQuestionnaires + pendingTickets + inboxPending)}</span>
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
  <SidekickHeader
    title={titleMap[view]}
    onClose={closeDrawer}
    onBack={view !== 'home' ? () => { view = 'home'; } : undefined}
    {expanded}
    onToggleExpand={!isMobile ? () => { expanded = !expanded; } : undefined}
  />

  <div class="drawer-body">
    {#if view === 'home'}
      <SidekickHome
        onNavigate={navigate}
        {pendingQuestionnaires}
        {helpSection}
        {helpContext}
        {pendingTickets}
        pendingInbox={inboxPending}
      />
    {:else if view === 'support'}
      <SupportView onCloseView={() => { view = 'home'; }} />
    {:else if view === 'questionnaire'}
      <QuestionnaireView onCloseView={() => { view = 'home'; }} />
    {:else if view === 'help'}
      <HelpView section={helpSection} context={helpContext} />
    {:else if view === 'tickets'}
      <TicketSidekickView onClose={closeDrawer} />
    {:else if view === 'inbox'}
      <InboxSidekickView onClose={closeDrawer} />
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
    background: #e8c870;
    color: #0f1623;
    border: 1.5px solid rgba(232, 200, 112, 0.35);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .fab:hover {
    transform: scale(1.06);
    box-shadow: 0 6px 24px rgba(232, 200, 112, 0.25), 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .fab-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #ef4444;
    color: #fff;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 5px;
    font-family: monospace;
    min-width: 18px;
    text-align: center;
    line-height: 1.4;
    pointer-events: none;
  }

  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 9050;
    background: #1a2235;
    border-left: 1px solid #243049;
    box-shadow: -4px 0 32px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    transition: transform 0.2s ease-out, width 0.2s ease-out;
    overflow: hidden;
    max-width: 100vw;
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  @media (max-width: 767px) {
    .drawer {
      width: 100vw !important;
      max-width: 420px !important;
    }
  }
</style>
