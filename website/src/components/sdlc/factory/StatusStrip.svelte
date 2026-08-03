<script lang="ts">
  import { onMount } from 'svelte';
  import PilotLight from './PilotLight.svelte';
  import { floorStore, acquireFloor } from '../../lib/stores/factory-floor-store';

  interface ControlState {
    killSwitch: boolean;
    dryRun: boolean;
    slotCap: number;
    dailyCap: number;
    updatedAt: string | null;
  }

  let { state: control }: { state: ControlState } = $props();

  let watchdogStale = $state(0);

  onMount(() => {
    const release = acquireFloor();
    const unsub = floorStore.subscribe((s) => { watchdogStale = s.payload?.control.watchdogStale ?? 0; });
    return () => { unsub(); release(); };
  });
</script>

<div class="status-strip">
  <div class="status-strip__item">
    <span class="status-strip__label">Last Update</span>
    <span class="status-strip__value">{control.updatedAt ?? '—'}</span>
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
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: var(--admin-radius-md);
    font-family: var(--admin-font-mono);
    font-size: var(--admin-text-sm);
  }

  .status-strip__item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-strip__label {
    color: var(--admin-text-mute);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: var(--admin-text-xs);
  }

  .status-strip__value {
    color: var(--admin-text);
  }
</style>
