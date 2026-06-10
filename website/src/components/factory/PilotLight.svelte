<script lang="ts">
  type PilotState = 'green' | 'amber' | 'red';
  type PilotSize = 'sm' | 'md' | 'lg';

  let {
    state = 'green',
    label = '',
    size = 'md',
    animated = true,
  }: {
    state?: PilotState;
    label?: string;
    size?: PilotSize;
    animated?: boolean;
  } = $props();

  const colorMap: Record<PilotState, string> = {
    green: 'var(--factory-success)',
    amber: 'var(--factory-accent)',
    red: 'var(--factory-error)',
  };

  const sizeMap: Record<PilotSize, string> = {
    sm: '8px',
    md: '12px',
    lg: '16px',
  };

  let color = $derived(colorMap[state]);
  let diameter = $derived(sizeMap[size]);
</script>

<span
  class="pilot-light"
  class:animated
  style="--pl-color: {color}; --pl-size: {diameter};"
  role="status"
  aria-label={label || state}
>
  <span class="pilot-light__dot"></span>
  {#if label}<span class="pilot-light__label">{label}</span>{/if}
</span>

<style>
  .pilot-light {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pilot-light__dot {
    display: inline-block;
    width: var(--pl-size);
    height: var(--pl-size);
    border-radius: 50%;
    background: var(--pl-color);
    box-shadow: 0 0 6px var(--pl-color), 0 0 12px color-mix(in srgb, var(--pl-color) 50%, transparent);
    flex-shrink: 0;
  }

  .pilot-light.animated .pilot-light__dot {
    animation: pilot-glow 2s ease-in-out infinite;
  }

  .pilot-light__label {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-sm);
    color: var(--factory-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  @keyframes pilot-glow {
    0%, 100% {
      box-shadow: 0 0 6px var(--pl-color), 0 0 12px color-mix(in srgb, var(--pl-color) 50%, transparent);
    }
    50% {
      box-shadow: 0 0 10px var(--pl-color), 0 0 24px color-mix(in srgb, var(--pl-color) 60%, transparent);
    }
  }
</style>
