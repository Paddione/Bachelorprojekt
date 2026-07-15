<script lang="ts">
  import { onMount } from 'svelte';
  import KillSwitchCard from './KillSwitchCard.svelte';
  import DryRunCard from './DryRunCard.svelte';
  import SlotCapCard from './SlotCapCard.svelte';
  import DailyCapCard from './DailyCapCard.svelte';
  import ContextBudgetCard from './ContextBudgetCard.svelte';
  import SpawnHarnessCard from './SpawnHarnessCard.svelte';
  import LavishDelegationCard from './LavishDelegationCard.svelte';
  import StatusStrip from './StatusStrip.svelte';

  interface ControlState {
    killSwitch: boolean;
    dryRun: boolean;
    slotCap: number;
    dailyCap: number;
    contextBudget: number;
    spawnHarness: boolean;
    lavishDelegation: boolean;
    updatedAt: string | null;
  }

  let state = $state<ControlState | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function loadState() {
    try {
      loading = true;
      const res = await fetch('/api/admin/factory-control');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state = await res.json() as ControlState;
      error = null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load';
    } finally {
      loading = false;
    }
  }

  async function patch(partial: Partial<ControlState>) {
    if (!state) return;
    const prev = { ...state };
    state = { ...state, ...partial };

    try {
      const res = await fetch('/api/admin/factory-control', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state = await res.json() as ControlState;
      error = null;
    } catch (err) {
      state = prev;
      error = err instanceof Error ? err.message : 'Update failed';
    }
  }

  onMount(() => {
    loadState();
  });
</script>

<div class="control-panel">
  {#if loading}
    <div class="control-panel__loading">Loading control state...</div>
  {:else if error && !state}
    <div class="control-panel__error">
      <p>Failed to load control state: {error}</p>
      <button onclick={loadState}>Retry</button>
    </div>
  {:else if state}
    <div class="control-panel__grid">
      <KillSwitchCard
        value={state.killSwitch}
        onchange={(v) => patch({ killSwitch: v })}
      />
      <DryRunCard
        value={state.dryRun}
        onchange={(v) => patch({ dryRun: v })}
      />
      <SlotCapCard
        value={state.slotCap}
        onchange={(v) => patch({ slotCap: v })}
      />
      <DailyCapCard
        value={state.dailyCap}
        onchange={(v) => patch({ dailyCap: v })}
      />
      <ContextBudgetCard
        value={state.contextBudget}
        onchange={(v) => patch({ contextBudget: v })}
      />
      <SpawnHarnessCard
        value={state.spawnHarness}
        onchange={(v) => patch({ spawnHarness: v })}
      />
      <LavishDelegationCard
        value={state.lavishDelegation}
        onchange={(v) => patch({ lavishDelegation: v })}
      />
    </div>

    {#if error}
      <div class="control-panel__toast">
        Update failed: {error}
      </div>
    {/if}

    <StatusStrip {state} />
  {/if}
</div>

<style>
  .control-panel {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .control-panel__loading,
  .control-panel__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    font-family: var(--admin-font-mono);
    color: var(--admin-text-secondary);
  }

  .control-panel__error p {
    margin: 0 0 1rem;
    color: var(--admin-error);
  }

  .control-panel__error button {
    padding: 0.5rem 1.5rem;
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    border-radius: var(--admin-radius-md);
    color: var(--admin-text-primary);
    cursor: pointer;
    font-family: var(--admin-font-mono);
  }

  .control-panel__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
  }

  .control-panel__toast {
    padding: 0.75rem 1rem;
    background: var(--admin-error);
    color: white;
    border-radius: var(--admin-radius-md);
    font-family: var(--admin-font-mono);
    font-size: var(--admin-text-sm);
  }

  @media (max-width: 768px) {
    .control-panel__grid {
      grid-template-columns: 1fr;
    }
  }
</style>
