<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PilotLight from './PilotLight.svelte';

  interface ControlState {
    killSwitch: boolean;
    dryRun: boolean;
    slotCap: number;
    dailyCap: number;
    updatedAt: string | null;
  }

  let { state }: { state: ControlState } = $props();

  let watchdogStale = $state(0);
  let lastActivity = $state<string | null>(null);

  let intervalId: ReturnType<typeof setInterval> | null = null;

  async function pollWatchdog() {
    try {
      const res = await fetch('/api/factory-floor');
      if (!res.ok) return;
      const data = await res.json() as { control?: { watchdogStale?: number; lastActivity?: string } };
      if (data.control) {
        watchdogStale = data.control.watchdogStale ?? 0;
        lastActivity = data.control.lastActivity ?? null;
      }
    } catch {
      // silent
    }
  }

  function formatTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString();
  }

  onMount(() => {
    pollWatchdog();
    intervalId = setInterval(pollWatchdog, 30000);
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });
</script>

<div class="status-strip">
  <div class="status-strip__item">
    <span class="status-strip__label">Last Update</span>
    <span class="status-strip__value">{formatTime(state.updatedAt)}</span>
  </div>
  <div class="status-strip__item">
    <span class="status-strip__label">Last Activity</span>
    <span class="status-strip__value">{formatTime(lastActivity)}</span>
  </div>
  <div class="status-strip__item">
    <PilotLight
      state={watchdogStale > 0 ? 'red' : 'green'}
      label={watchdogStale > 0 ? `${watchdogStale} stale` : 'watchdog OK'}
      size="sm"
    />
  </div>
</div>

<style>
  .status-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 0.75rem 1rem;
    background: var(--factory-surface);
    border: 1px solid var(--factory-border);
    border-radius: var(--factory-radius-md);
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
  }

  .status-strip__item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-strip__label {
    color: var(--factory-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: var(--factory-text-xs);
  }

  .status-strip__value {
    color: var(--factory-text-primary);
  }
</style>
