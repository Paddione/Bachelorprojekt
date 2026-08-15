<script lang="ts">
  import { onMount } from 'svelte';
  import PilotLight from '../sdlc/factory/PilotLight.svelte';
  import { floorStore, acquireFloor } from '../../lib/stores/factory-floor-store.ts';
  import { deriveCountdownSec } from '../../lib/parallel-status';

  export type CockpitMode = 'overview' | 'fokus' | 'insights';

  interface Props {
    brand: string;
    initialMode?: CockpitMode;
  }

  let { brand, initialMode = 'overview' }: Props = $props();

  let activeMode = $state<CockpitMode>(initialMode);
  let watchdogStale = $state(0);
  let slotUsed = $state(0);
  let slotCap = $state(3);
  let agentCount = $state(0);
  let nextTickAt: string | null = $state(null);
  let nowMs = $state(Date.now());
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  let remainingSec = $derived(
    nextTickAt ? deriveCountdownSec(nextTickAt, new Date(nowMs).toISOString()) : null,
  );

  function fmtCountdown(sec: number): string {
    const s = Math.max(0, sec);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function switchMode(mode: CockpitMode) {
    activeMode = mode;
    const url = new URL(window.location.href);
    if (mode === 'overview') {
      url.searchParams.set('mode', 'overview');
      url.searchParams.delete('phase');
    } else if (mode === 'insights') {
      url.searchParams.set('mode', 'insights');
      url.searchParams.delete('phase');
    } else {
      url.searchParams.set('mode', 'fokus');
    }
    history.pushState({}, '', url.toString());
    dispatch('modechange', { mode });
  }

  // Direkt auf `document` dispatchen. Ein `document.createElement(...)`-Element
  // haengt an keinem Baum: sein Event bubbelt nur bis zu diesem losen Knoten und
  // erreicht `document` nie — der Listener in cockpit.astro feuerte dann gar nicht.
  function dispatch(name: string, detail: unknown) {
    document.dispatchEvent(new CustomEvent(`cockpit-${name}`, { detail }));
  }

  onMount(() => {
    const release = acquireFloor();
    const unsub = floorStore.subscribe((s) => {
      if (s.payload) {
        watchdogStale = s.payload.control.watchdogStale ?? 0;
        slotUsed = s.payload.slots?.used ?? 0;
        slotCap = s.payload.control.slotCap ?? 3;
      }
    });

    // Fetch parallel status for tick countdown
    async function loadParallel() {
      try {
        const res = await fetch('/sdlc/api/factory/parallel-status');
        if (res.ok) {
          const data = await res.json();
          if (data.nextTickAt) nextTickAt = data.nextTickAt;
          if (data.slotsClaimed != null) slotUsed = data.slotsClaimed;
        }
      } catch { /* silent — countdown is advisory */ }
    }
    loadParallel();

    tickTimer = setInterval(() => { nowMs = Date.now(); }, 1000);

    return () => {
      unsub();
      release();
      if (tickTimer) clearInterval(tickTimer);
    };
  });
</script>

<header class="command-bar" data-testid="command-bar">
  <div class="command-bar__left">
    <span class="command-bar__brand">{brand}</span>

    <div class="command-bar__item" data-testid="cluster-health">
      <PilotLight state="green" label="cluster" size="sm" />
    </div>

    <div class="command-bar__item">
      <PilotLight
        state={watchdogStale > 0 ? 'red' : 'green'}
        label={watchdogStale > 0 ? `${watchdogStale} stale` : 'wd OK'}
        size="sm"
      />
    </div>

    <div class="command-bar__item">
      <span class="command-bar__badge" title="Active agents">
        👤 {agentCount || '—'}
      </span>
    </div>

    <div class="command-bar__item">
      <span class="command-bar__badge" title="Factory slots">
        🎯 {slotUsed}/{slotCap}
      </span>
    </div>

    <div class="command-bar__item">
      <span class="command-bar__badge" title="Open PRs">🔀 —</span>
    </div>
  </div>

  <div class="command-bar__right">
    {#if remainingSec !== null && remainingSec <= 0}
      <span class="command-bar__tick command-bar__tick--due">Tick fällig</span>
    {:else if remainingSec !== null}
      <span class="command-bar__tick">⏱ {fmtCountdown(remainingSec)}</span>
    {:else}
      <span class="command-bar__tick">⏱ —:—</span>
    {/if}

    <div class="command-bar__toggle" role="tablist" data-testid="mode-toggle">
      <button
        class="command-bar__toggle-btn"
        class:active={activeMode === 'overview'}
        role="tab"
        aria-selected={activeMode === 'overview'}
        onclick={() => switchMode('overview')}
      >Übersicht</button>
      <button
        class="command-bar__toggle-btn"
        class:active={activeMode === 'fokus'}
        role="tab"
        aria-selected={activeMode === 'fokus'}
        onclick={() => switchMode('fokus')}
      >Fokus</button>
      <button
        class="command-bar__toggle-btn"
        class:active={activeMode === 'insights'}
        role="tab"
        aria-selected={activeMode === 'insights'}
        onclick={() => switchMode('insights')}
      >Insights</button>
    </div>
  </div>
</header>

<style>
  .command-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--admin-surface, rgba(255,255,255,0.03));
    border-bottom: 1px solid var(--admin-border, rgba(255,255,255,0.07));
    font-family: var(--admin-font-mono, monospace);
    font-size: var(--admin-text-xs, 0.75rem);
    color: var(--admin-text-secondary, #8892b0);
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .command-bar__left,
  .command-bar__right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .command-bar__brand {
    font-weight: 600;
    color: var(--admin-accent, oklch(0.80 0.09 75));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-right: 0.5rem;
  }

  .command-bar__item {
    display: flex;
    align-items: center;
  }

  .command-bar__badge {
    font-size: var(--admin-text-xs, 0.75rem);
    color: var(--admin-text-secondary, #8892b0);
  }

  .command-bar__tick {
    font-size: var(--admin-text-xs, 0.75rem);
    color: var(--admin-text-secondary, #8892b0);
  }

  .command-bar__tick--due {
    color: var(--admin-error, #d77a6e);
    font-weight: 600;
  }

  .command-bar__toggle {
    display: flex;
    background: var(--admin-surface-hover, rgba(255,255,255,0.05));
    border-radius: var(--admin-radius-sm, 4px);
    overflow: hidden;
  }

  .command-bar__toggle-btn {
    padding: 0.3rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--admin-text-secondary, #8892b0);
    font-family: var(--admin-font-mono, monospace);
    font-size: var(--admin-text-xs, 0.75rem);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .command-bar__toggle-btn:hover {
    background: var(--admin-surface-hover, rgba(255,255,255,0.08));
  }

  .command-bar__toggle-btn.active {
    background: var(--admin-accent, oklch(0.80 0.09 75));
    color: var(--admin-bg, #0b111c);
    font-weight: 600;
  }

  @media (max-width: 767px) {
    .command-bar {
      padding: 0.4rem 0.75rem;
      gap: 0.5rem;
    }

    .command-bar__left,
    .command-bar__right {
      gap: 0.5rem;
    }

    .command-bar__toggle-btn {
      padding: 0.25rem 0.5rem;
      font-size: 0.7rem;
    }
  }
</style>
