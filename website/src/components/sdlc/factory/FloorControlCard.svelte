<script lang="ts">
  import type { ControlSnapshot } from '../../lib/factory-floor-types';
  let { control }: { control: ControlSnapshot } = $props();
</script>

<div class="floor-control">
  <p class="floor-control__label">Kill-Switch</p>
  <p class="floor-control__value" data-on={control.killSwitch}>{control.killSwitch ? 'AN' : 'aus'}</p>
</div>

<style>
  .floor-control {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--ink-850);
    border: 1px solid var(--line);
  }
  .floor-control__label { font-family: var(--mono); font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--mute); margin: 0; }
  .floor-control__value { font-family: var(--mono); font-size: 1.05rem; font-weight: 700; color: var(--brass); margin: 0; }
  .floor-control__value[data-on="true"] { color: var(--danger); }
</style>
