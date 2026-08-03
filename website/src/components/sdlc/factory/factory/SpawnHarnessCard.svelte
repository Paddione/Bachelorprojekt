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

<ControlCard title="Spawn Harness">
  <ToggleSwitch
    {value}
    size="lg"
    colorOn="var(--admin-primary, #818cf8)"
    colorOff="var(--admin-border, #21262d)"
    {onchange}
  />
  <PilotLight
    state={value ? 'green' : 'red'}
    label={value ? 'ACTIVE' : 'OFF'}
    size="md"
  />
</ControlCard>
