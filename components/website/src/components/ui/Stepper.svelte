<script lang="ts">
  let {
    value = 1,
    min = 1,
    max = 10,
    onchange,
  }: {
    value?: number;
    min?: number;
    max?: number;
    onchange?: (value: number) => void;
  } = $props();

  function decrement() {
    if (value > min) onchange?.(value - 1);
  }

  function increment() {
    if (value < max) onchange?.(value + 1);
  }
</script>

<div class="stepper">
  <button
    type="button"
    class="stepper__btn stepper__btn--minus"
    onclick={decrement}
    disabled={value <= min}
    aria-label="Decrease"
  >
    −
  </button>
  <span class="stepper__value">{value}</span>
  <button
    type="button"
    class="stepper__btn stepper__btn--plus"
    onclick={increment}
    disabled={value >= max}
    aria-label="Increase"
  >
    +
  </button>
</div>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--factory-font-mono);
  }

  .stepper__btn {
    width: 44px;
    height: 44px;
    border: 1px solid var(--factory-border);
    border-radius: var(--factory-radius-md);
    background: var(--factory-surface);
    color: var(--factory-text-primary);
    font-size: 1.25rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stepper__btn:hover:not(:disabled) {
    background: var(--factory-surface-elevated);
    border-color: var(--factory-accent);
  }

  .stepper__btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .stepper__value {
    min-width: 3rem;
    text-align: center;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--factory-text-primary);
  }
</style>
