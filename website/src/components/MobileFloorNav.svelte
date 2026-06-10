<script lang="ts">
  const MOBILE_COLS = [
    'staged', 'backlog',
    'scout', 'design', 'plan', 'implement', 'verify', 'deploy',
    'qs', 'done',
  ] as const;
  type MobileCol = (typeof MOBILE_COLS)[number];

  let { mobileColIndex, onPrev, onNext }: {
    mobileColIndex: number;
    onPrev: () => void;
    onNext: () => void;
  } = $props();
</script>

<div class="mobile-col-nav">
  <button class="mobile-nav-arrow" onclick={onPrev} disabled={mobileColIndex === 0}>←</button>
  <div class="mobile-col-title">
    {MOBILE_COLS[mobileColIndex].toUpperCase()}
  </div>
  <button class="mobile-nav-arrow" onclick={onNext} disabled={mobileColIndex === MOBILE_COLS.length - 1}>→</button>
</div>
<div class="mobile-pips">
  {#each MOBILE_COLS as _, i}
    <div class="pip" class:pip-active={i === mobileColIndex} class:pip-done={i < mobileColIndex}></div>
  {/each}
</div>

<style>
  .mobile-col-nav {
    display: none;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
  }
  .mobile-col-title {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-brass, oklch(0.80 0.09 75));
  }
  .mobile-nav-arrow {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--color-ink-800, #17202e);
    border: 1px solid rgba(255,255,255,0.12);
    color: var(--color-mute, #8c96a3);
    font-size: 15px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .mobile-nav-arrow:disabled { opacity: 0.3; cursor: not-allowed; }

  .mobile-pips {
    display: none;
    gap: 3px;
    padding: 0 16px 8px;
  }
  .pip {
    flex: 1; height: 2px; border-radius: 1px;
    background: var(--color-ink-750, #1d2736);
  }
  .pip.pip-done { background: rgba(255,255,255,0.25); }
  .pip.pip-active { background: var(--color-brass, oklch(0.80 0.09 75)); }

  @media (max-width: 767px) {
    .mobile-col-nav { display: flex; }
    .mobile-pips    { display: flex; }
  }
</style>
