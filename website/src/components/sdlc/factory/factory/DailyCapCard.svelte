<script lang="ts">
  import ControlCard from './ControlCard.svelte';
  import { Stepper } from '../ui';

  let {
    value = 20,
    onchange,
  }: {
    value?: number;
    onchange?: (value: number) => void;
  } = $props();
</script>

<ControlCard title="Daily Cap">
  <Stepper {value} min={1} max={50} {onchange} />
  <div class="daily-cap-label">deploys / day</div>
</ControlCard>

<style>
  .daily-cap-label {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
    color: var(--factory-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
