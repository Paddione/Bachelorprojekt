<script lang="ts">
  import type { HelpContext } from '../lib/helpContent';
  import SidekickHeader from './assistant/SidekickHeader.svelte';
  import SidekickHome from './assistant/SidekickHome.svelte';
  import SupportView from './assistant/SupportView.svelte';
  import QuestionnaireView from './assistant/QuestionnaireView.svelte';
  import HelpView from './assistant/HelpView.svelte';

  type View = 'home' | 'support' | 'questionnaire' | 'help';

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
  {#if pendingQuestionnaires > 0 && !open}
    <span class="fab-badge">{pendingQuestionnaires > 9 ? '9+' : pendingQuestionnaires}</span>
  {/if}
  <span class="fab-icon">{open ? '✕' : '🛎'}</span>
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
      />
    {:else if view === 'support'}
      <SupportView onCloseView={() => { view = 'home'; }} />
    {:else if view === 'questionnaire'}
      <QuestionnaireView onCloseView={() => { view = 'home'; }} />
    {:else if view === 'help'}
      <HelpView section={helpSection} context={helpContext} />
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
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    transition: transform 0.15s, box-shadow 0.15s;
    position: fixed;
  }
  .fab:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  }

  .fab-icon {
    font-size: 22px;
    line-height: 1;
    pointer-events: none;
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
