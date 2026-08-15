<script lang="ts">
  let {
    value = false,
    size = 'md',
    colorOn = 'var(--factory-success)',
    colorOff = 'var(--factory-error)',
    glow = true,
    onchange,
  }: {
    value?: boolean;
    size?: 'sm' | 'md' | 'lg';
    colorOn?: string;
    colorOff?: string;
    glow?: boolean;
    onchange?: (value: boolean) => void;
  } = $props();

  const sizeMap = { sm: '40px', md: '56px', lg: '80px' };
  let width = $derived(sizeMap[size]);
</script>

<button
  type="button"
  class="toggle-switch"
  class:on={value}
  class:glow
  style="--ts-width: {width}; --ts-color-on: {colorOn}; --ts-color-off: {colorOff};"
  onclick={() => onchange?.(!value)}
  role="switch"
  aria-checked={value}
>
  <span class="toggle-switch__track">
    <span class="toggle-switch__thumb"></span>
  </span>
</button>

<style>
  .toggle-switch {
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  .toggle-switch__track {
    position: relative;
    width: var(--ts-width);
    height: calc(var(--ts-width) * 0.45);
    border-radius: calc(var(--ts-width) * 0.25);
    background: var(--ts-color-off);
    transition: background 0.2s;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .toggle-switch.on .toggle-switch__track {
    background: var(--ts-color-on);
  }

  .toggle-switch.glow.on .toggle-switch__track {
    box-shadow: 0 0 12px var(--ts-color-on), inset 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch.glow:not(.on) .toggle-switch__track {
    box-shadow: 0 0 8px var(--ts-color-off), inset 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .toggle-switch__thumb {
    position: absolute;
    top: 50%;
    left: 3px;
    transform: translateY(-50%);
    width: calc(var(--ts-width) * 0.35);
    height: calc(var(--ts-width) * 0.35);
    border-radius: 50%;
    background: white;
    transition: left 0.2s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .toggle-switch.on .toggle-switch__thumb {
    left: calc(var(--ts-width) - calc(var(--ts-width) * 0.35) - 3px);
  }
</style>
