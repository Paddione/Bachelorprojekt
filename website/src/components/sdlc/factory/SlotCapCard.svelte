<script lang="ts">
  import ControlCard from './ControlCard.svelte';
  import { Stepper, SegmentDots } from '../ui';

  let {
    value = 4,
    onchange,
  }: {
    value?: number;
    onchange?: (value: number) => void;
  } = $props();
</script>

<ControlCard title="Slot Cap">
  <Stepper {value} min={1} max={8} {onchange} />
  <SegmentDots total={8} filled={value} colorFilled="var(--factory-success)" />
</ControlCard>
