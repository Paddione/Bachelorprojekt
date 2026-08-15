<script lang="ts">
  import { onMount } from 'svelte';
  import PilotLight from '../sdlc/factory/PilotLight.svelte';
  import { floorStore, acquireFloor } from '../../lib/stores/factory-floor-store.ts';
  import { deriveCountdownSec } from '../../lib/parallel-status';

  interface Props {
    brand: string;
  }

  let { brand }: Props = $props();

  let watchdogStale = $state(0);
  let slotUsed = $state(0);
  let slotCap = $state(3);
  let agentCount = $state(0);
  let nextTickAt: string | null = $state(null);
  let nowMs = $state(Date.now());
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let helpOpen = $state(false);

  let remainingSec = $derived(
    nextTickAt ? deriveCountdownSec(nextTickAt, new Date(nowMs).toISOString()) : null,
  );

  function fmtCountdown(sec: number): string {
    const s = Math.max(0, sec);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  // Port aus CommandBar.svelte (vor dessen Loeschung): floorStore-Subscribe fuer
  // Watchdog/Slots, parallel-status-Fetch fuer den Tick-Countdown. deriveCountdownSec
  // wird unveraendert aus lib/parallel-status.ts wiederverwendet, nicht dupliziert.
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

  // Help-Toggle: lokaler Zustand, aendert NIE station/ticket/deck in der URL
  // (Requirement "Help toggle opens without changing the selection").
  function toggleHelp() {
    helpOpen = !helpOpen;
  }
</script>

<header class="ls-statusband" data-testid="leitstand-statusband">
  <div class="ls-statusband__left">
    <span class="ls-statusband__brand">{brand}</span>

    <div class="ls-statusband__item" data-testid="cluster-health">
      <PilotLight state="green" label="cluster" size="sm" />
    </div>

    <div class="ls-statusband__item">
      <PilotLight
        state={watchdogStale > 0 ? 'red' : 'green'}
        label={watchdogStale > 0 ? `${watchdogStale} stale` : 'wd OK'}
        size="sm"
      />
    </div>

    <div class="ls-statusband__item">
      <span class="ls-statusband__badge" title="Active agents">
        👤 {agentCount || '—'}
      </span>
    </div>

    <div class="ls-statusband__item">
      <span class="ls-statusband__badge" title="Factory slots">
        🎯 {slotUsed}/{slotCap}
      </span>
    </div>

    <div class="ls-statusband__item">
      <span class="ls-statusband__badge" title="Open PRs">🔀 —</span>
    </div>
  </div>

  <div class="ls-statusband__right">
    {#if remainingSec !== null && remainingSec <= 0}
      <span class="ls-statusband__tick ls-statusband__tick--due">Tick fällig</span>
    {:else if remainingSec !== null}
      <span class="ls-statusband__tick">⏱ {fmtCountdown(remainingSec)}</span>
    {:else}
      <span class="ls-statusband__tick">⏱ —:—</span>
    {/if}

    <!-- Live/Fixtures-Badge: cockpit.astro's updateHeader() schreibt hier per
         window.data.streamState() hinein (Ort wandert vom alten Header nach Z1). -->
    <span id="leitstand-stream-state" class="ls-statusband__stream" aria-live="polite">● —</span>

    <button
      type="button"
      class="ls-statusband__help"
      aria-expanded={helpOpen}
      onclick={toggleHelp}
    >?</button>
  </div>
</header>

{#if helpOpen}
  <p class="ls-statusband__help-hint" role="status">Hilfe-Overlay folgt in E5</p>
{/if}

<style>
  .ls-statusband {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ls-space-4);
    padding: var(--ls-space-4) var(--ls-space-6);
    background: var(--ls-surface-base);
    border-bottom: 1px solid var(--ls-line);
    font-family: var(--ls-font-mono);
    font-size: 0.75rem;
    color: var(--ls-text-secondary);
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .ls-statusband__left,
  .ls-statusband__right {
    display: flex;
    align-items: center;
    gap: var(--ls-space-6);
    min-width: 0;
  }

  .ls-statusband__brand {
    font-weight: 600;
    color: var(--ls-signal-info);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-right: var(--ls-space-2);
    white-space: nowrap;
  }

  .ls-statusband__item {
    display: flex;
    align-items: center;
  }

  .ls-statusband__badge {
    font-size: 0.75rem;
    color: var(--ls-text-secondary);
    white-space: nowrap;
  }

  .ls-statusband__tick {
    font-size: 0.75rem;
    color: var(--ls-text-secondary);
    white-space: nowrap;
  }

  .ls-statusband__tick--due {
    color: var(--ls-signal-red);
    font-weight: 600;
  }

  .ls-statusband__stream {
    font-size: 0.75rem;
    color: var(--ls-text-muted);
    white-space: nowrap;
  }

  .ls-statusband__help {
    border: 1px solid var(--ls-line-strong);
    border-radius: var(--ls-radius-sm);
    background: var(--ls-surface-raised);
    color: var(--ls-text-secondary);
    font-family: var(--ls-font-mono);
    font-size: 0.75rem;
    line-height: 1;
    padding: var(--ls-space-2) var(--ls-space-3);
    cursor: pointer;
    transition: border-color var(--ls-dur-fast) var(--ls-ease), color var(--ls-dur-fast) var(--ls-ease);
  }

  .ls-statusband__help:hover {
    border-color: var(--ls-signal-info);
    color: var(--ls-text-primary);
  }

  .ls-statusband__help-hint {
    margin: 0;
    padding: var(--ls-space-3) var(--ls-space-6);
    background: var(--ls-surface-raised);
    border-bottom: 1px solid var(--ls-line);
    color: var(--ls-text-muted);
    font-size: 0.75rem;
  }

  @media (max-width: 767px) {
    .ls-statusband {
      padding: var(--ls-space-3) var(--ls-space-4);
      gap: var(--ls-space-2);
    }

    .ls-statusband__left,
    .ls-statusband__right {
      gap: var(--ls-space-3);
    }

    .ls-statusband__brand {
      display: none;
    }
  }
</style>
