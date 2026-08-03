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

<ControlCard title="Kill Switch">
  <ToggleSwitch
    {value}
    size="lg"
    colorOn="var(--factory-success)"
    colorOff="var(--factory-error)"
    {onchange}
  />
  <PilotLight
    state={value ? 'green' : 'red'}
    label={value ? 'ACTIVE' : 'STOPPED'}
    size="md"
  />
</ControlCard>
