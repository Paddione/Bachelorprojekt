<script lang="ts">
  import ControlCard from './ControlCard.svelte';
  import PilotLight from './PilotLight.svelte';
  import { ToggleSwitch } from '../ui';

  let {
    value = false,
    onchange,
  }: {
    value?: boolean;
    onchange?: (value: boolean) => void;
  } = $props();
</script>

<ControlCard title="Dry Run">
  <ToggleSwitch
    {value}
    size="lg"
    colorOn="var(--factory-accent)"
    colorOff="var(--factory-border)"
    {onchange}
  />
  {#if value}
    <div class="dry-run-warning">
      <span class="warning-icon">⚠</span>
      <span class="warning-text">TEST MODE</span>
    </div>
  {:else}
    <PilotLight state="amber" label="STANDBY" size="md" />
  {/if}
</ControlCard>

<style>
  .dry-run-warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: oklch(0.80 0.09 75 / 0.15);
    border: 1px solid var(--factory-accent);
    border-radius: var(--factory-radius-md);
  }

  .warning-icon {
    font-size: 1.25rem;
  }

  .warning-text {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
    font-weight: 700;
    color: var(--factory-accent);
    letter-spacing: 0.05em;
  }
</style>
