<script lang="ts">
  import type { HelpContext } from '../lib/helpContent';
  import SidekickHeader from './assistant/SidekickHeader.svelte';
  import SidekickHome from './assistant/SidekickHome.svelte';
  import SupportView from './assistant/SupportView.svelte';
  import QuestionnaireView from './assistant/QuestionnaireView.svelte';
  import HelpView from './assistant/HelpView.svelte';
  import AgentGuideView from './assistant/AgentGuideView.svelte';
  import MediaviewerPanel from './MediaviewerPanel.svelte';
  import TerminalSessionIframe from './terminal/TerminalSessionIframe.svelte';
  import CockpitSidekickView from './assistant/CockpitSidekickView.svelte';
  import AiQualitySidekickView from './assistant/AiQualitySidekickView.svelte';
  import LogsSidekickView from './assistant/LogsSidekickView.svelte';
  import { resolveHelpVideos } from '../lib/help-videos';
  import { parseNavigateEvent } from '../lib/assistant/sidekick-nudge';
  import { registerBrowserLogCapture } from '../lib/logging/browser-collector';
  import { addEntry } from '../lib/logging/log-store';
  import { logger } from '../lib/logger';

  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'mediaviewer' | 'terminal' | 'cockpit' | 'ai-quality' | 'logs' | 'agent-settings';

  let {
    helpSection = '',
    helpContext = 'portal' as HelpContext,
    mediaviewerHost = 'mediaviewer.localhost',
    videovaultHost = 'videovault.localhost',
    terminalHost = 'terminal.localhost',
  }: {
    helpSection?: string;
    helpContext?: HelpContext;
    mediaviewerHost?: string;
    videovaultHost?: string;
    terminalHost?: string;
  } = $props();

  let open = $state(false);
  let expanded = $state(false);
  let view = $state<View>('home');
  let pendingQuestionnaires = $state(0);
  let pendingContainerCount = $state(0);
  let aiErrorCount = $state(0);
  const mediaviewerVideos = $derived(resolveHelpVideos(videovaultHost));
  let isMobile = $state(false);

  let pendingJump = $state<string | null>(null);

  // User identity for header / avatar
  let userAvailable = $state(true);

  const STANDARD_WIDTH = 460;
  const EXPANDED_WIDTH = 640;

  const drawerWidth = $derived(
    isMobile ? (window?.innerWidth ?? 460) : (expanded ? EXPANDED_WIDTH : STANDARD_WIDTH)
  );

  const titleMap: Record<View, string> = {
    home: 'Sidekick',
    support: 'Feedback & Support',
    questionnaire: 'Fragebögen',
    help: 'Hilfe',
    'agent-guide': 'Agent-Anleitung',
    mediaviewer: 'Mediaviewer',
    terminal: 'Agentic Terminal',
    cockpit: 'Projekt-Cockpit',
    'ai-quality': 'KI-Qualität',
    logs: 'Logs',
    'agent-settings': 'Agenten-Einstellungen',
  };

  // Capture client-side errors into the central log bus (admin sessions only),
  // registered once at mount so failures anywhere in the app reach the widget.
  $effect(() => {
    if (helpContext !== 'admin') return;
    return registerBrowserLogCapture(addEntry);
  });

  let settings = $state({
    contextBudget: 180000,
    spawnHarness: false,
    lavishDelegation: false,
    killSwitch: false,
  });
  let settingsLoading = $state(false);

  async function fetchSettings() {
    try {
      settingsLoading = true;
      const res = await fetch('/api/admin/factory-control', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        settings.contextBudget = data.contextBudget ?? 180000;
        settings.spawnHarness = !!data.spawnHarness;
        settings.lavishDelegation = !!data.lavishDelegation;
        settings.killSwitch = !!data.killSwitch;
      }
    } catch (e) {
      logger.error('Failed to fetch settings:', e);
    } finally {
      settingsLoading = false;
    }
  }

  async function saveSettings() {
    try {
      await fetch('/api/admin/factory-control', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch (e) {
      logger.error('Failed to save settings:', e);
    }
  }

  $effect(() => {
    if (view === 'agent-settings') {
      void fetchSettings();
    }
  });

  $effect(() => {
    checkMobile();
    const handler = () => checkMobile();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  });

  $effect(() => {
    const onCockpitToggle = () => {
      if (helpContext === 'admin') {
        open = !open;
      }
    };
    window.addEventListener('cockpit:toggle-sidekick', onCockpitToggle);
    return () => window.removeEventListener('cockpit:toggle-sidekick', onCockpitToggle);
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

        const qRes = await fetch('/api/portal/questionnaires');
        if (qRes.ok) {
          const qs = await qRes.json() as Array<{ status: string }>;
          pendingQuestionnaires = Array.isArray(qs)
            ? qs.filter(q => !['submitted', 'reviewed', 'dismissed', 'archived'].includes(q.status)).length
            : 0;
        }

        if (helpContext === 'admin') {
          try {
            const cRes = await fetch('/api/admin/cockpit/container-count', { credentials: 'same-origin' });
            if (cRes.ok) {
              const cd = await cRes.json() as { total?: number };
              pendingContainerCount = cd.total ?? 0;
            }
          } catch { /* badge stays 0 */ }
          try {
            const aRes = await fetch('/api/admin/ai-quality', { credentials: 'same-origin' });
            if (aRes.ok) {
              const ad = await aRes.json() as { recentErrors?: unknown[] };
              aiErrorCount = Array.isArray(ad.recentErrors) ? ad.recentErrors.length : 0;
            }
          } catch { /* badge stays 0 */ }
        }
      } catch { /* widget is optional */ }
    })();
  });

  $effect(() => {
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const intent = parseNavigateEvent(detail);
      if (!intent) return;
      open = true;
      view = intent.view;
      pendingJump = intent.jumpTo;
    };
    window.addEventListener('sidekick:navigate', onNavigate);
    return () => window.removeEventListener('sidekick:navigate', onNavigate);
  });

  function openDrawer() { open = true; view = 'home'; }
  function closeDrawer() { open = false; }
  function toggleDrawer() { if (open) closeDrawer(); else openDrawer(); }
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
  onclick={toggleDrawer}
  aria-label={open ? 'Sidekick schließen' : 'Sidekick öffnen'}
  aria-expanded={open}
>
  {#if (pendingQuestionnaires > 0 || pendingContainerCount > 0) && !open}
    <span class="fab-badge">{Math.min(99, pendingQuestionnaires + pendingContainerCount)}</span>
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
  inert={open ? undefined : true}
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
        {pendingContainerCount}
        {aiErrorCount}
      />
    {:else if view === 'support'}
      <SupportView onCloseView={() => { view = 'home'; }} />
    {:else if view === 'questionnaire'}
      <QuestionnaireView onCloseView={() => { view = 'home'; }} />
    {:else if view === 'help'}
      <HelpView section={helpSection} context={helpContext} />
    {:else if view === 'agent-guide'}
      <AgentGuideView jumpTo={pendingJump} />
    {:else if view === 'mediaviewer'}
      <MediaviewerPanel {mediaviewerHost} videos={mediaviewerVideos} />
    {:else if view === 'terminal'}
      <TerminalSessionIframe {terminalHost} />
    {:else if view === 'cockpit'}
      <CockpitSidekickView />
    {:else if view === 'ai-quality'}
      <AiQualitySidekickView />
    {:else if view === 'logs'}
      <LogsSidekickView />
    {:else if view === 'agent-settings'}
      <div class="agent-settings">
        {#if settingsLoading}
          <div class="loading">Einstellungen laden...</div>
        {:else}
          <div class="settings-group">
            <h3>Orchestrierungs-Globals</h3>
            
            <div class="setting-item">
              <label for="context-budget">Token-Budget</label>
              <div class="input-with-hint">
                <input 
                  id="context-budget" 
                  type="number" 
                  min="0" 
                  max="180000" 
                  bind:value={settings.contextBudget} 
                  onchange={saveSettings} 
                />
                <input 
                  type="range" 
                  min="0" 
                  max="180000" 
                  step="5000"
                  bind:value={settings.contextBudget} 
                  oninput={saveSettings} 
                />
                <span class="hint">Maximales Token-Budget (Standard: 180000)</span>
              </div>
            </div>

            <div class="setting-item switch-row">
              <div>
                <label for="spawn-harness">opencode Spawn Harness</label>
                <span class="hint">Aktiviert den opencode spawn wrapper</span>
              </div>
              <input 
                id="spawn-harness" 
                type="checkbox" 
                bind:checked={settings.spawnHarness} 
                onchange={saveSettings} 
              />
            </div>

            <div class="setting-item switch-row">
              <div>
                <label for="lavish-delegation">Lavish HTML Delegation Review</label>
                <span class="hint">Claude validiert die qwen3.5 Ergebnisse</span>
              </div>
              <input 
                id="lavish-delegation" 
                type="checkbox" 
                bind:checked={settings.lavishDelegation} 
                onchange={saveSettings} 
              />
            </div>

            <div class="setting-item switch-row">
              <div>
                <label for="kill-switch">Master Kill-Switch (Alle Agenten)</label>
                <span class="hint">Deaktiviert alle Agenten global</span>
              </div>
              <input 
                id="kill-switch" 
                type="checkbox" 
                bind:checked={settings.killSwitch} 
                onchange={saveSettings} 
              />
            </div>
            
            <div class="setting-link">
              <a href="/admin/ki-konfiguration" class="admin-link">
                → Zur Key- & Provider-Konfiguration
              </a>
            </div>
          </div>
        {/if}
      </div>
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
    }
  }

  .agent-settings {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    color: var(--fg, #f4f4f5);
  }
  .settings-group {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .settings-group h3 {
    margin: 0;
    font-family: var(--serif);
    font-size: 20px;
    color: var(--brass, #e8c870);
    border-bottom: 1px solid rgba(232, 200, 112, 0.12);
    padding-bottom: 8px;
  }
  .setting-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .setting-item label {
    font-weight: 600;
    font-size: 14px;
  }
  .switch-row {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 12px;
  }
  .switch-row label {
    display: block;
    margin-bottom: 2px;
  }
  .input-with-hint {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .input-with-hint input[type="number"] {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(232, 200, 112, 0.2);
    color: var(--fg);
    padding: 6px 10px;
    border-radius: 4px;
    font-family: var(--font-mono, monospace);
  }
  .hint {
    font-size: 12px;
    color: var(--mute, #a1a1aa);
  }
  .setting-link {
    margin-top: 12px;
  }
  .admin-link {
    color: var(--brass, #e8c870);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
  }
  .admin-link:hover {
    text-decoration: underline;
  }
</style>
