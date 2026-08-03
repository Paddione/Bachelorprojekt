<script lang="ts">
  import type { TicketDetail, InjectionKind } from '../../lib/factory-floor-types';
  import type { CiCheck, CiRollup } from '../../lib/factory-ci';
  import DetailPanelSidebar from './DetailPanelSidebar.svelte';

  let {
    detail,
    selected,
    onClose,
    injKind,
    injPhase,
    injTitle,
    injContent,
    injBusy,
    injError,
    onSubmitInjection,
    prUrl,
    isMobile = false,
  }: {
    detail: TicketDetail | null;
    selected: string | null;
    onClose: () => void;
    injKind: InjectionKind;
    injPhase: string;
    injTitle: string;
    injContent: string;
    injBusy: boolean;
    injError: string | null;
    onSubmitInjection: () => void;
    prUrl: (n: number) => string;
    isMobile?: boolean;
  } = $props();

  let ciChecks = $state<CiCheck[]>([]);
  let ciRollup = $state<CiRollup>(null);

  $effect(() => {
    if (!selected) { ciChecks = []; ciRollup = null; return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/factory-floor/${encodeURIComponent(selected)}/ci`, { credentials: 'same-origin' });
        if (r.ok && !cancelled) {
          const d = await r.json();
          ciChecks = d.checks ?? [];
          ciRollup = d.rollup ?? null;
        }
      } catch { /* CI stays empty on error */ }
    })();
    return () => { cancelled = true; };
  });
</script>

{#if selected}
  {#if isMobile}
    <div class="detail-panel__backdrop" onclick={onClose} aria-hidden="true"></div>
  {/if}
  <div class="detail-panel" class:open={isMobile} data-testid="floor-detail">
    <button class="detail-panel__close" onclick={onClose}>✕</button>
    <h3 class="detail-panel__title">{selected}</h3>

    {#if !detail}
      <p class="detail-panel__loading">Lädt…</p>
    {:else}
      <DetailPanelSidebar
        {detail}
        {ciChecks}
        {ciRollup}
        {injKind}
        {injPhase}
        {injTitle}
        {injContent}
        {injBusy}
        {injError}
        {onSubmitInjection}
        {prUrl}
      />
    {/if}
  </div>
{/if}

<style>
  .detail-panel {
    position: fixed;
    inset: 0 auto 0 0;
    right: 0;
    width: var(--factory-detail-width);
    max-width: 100vw;
    background: var(--factory-bg);
    border-left: 1px solid var(--factory-border);
    padding: var(--factory-spacing-lg);
    overflow-y: auto;
    z-index: 50;
    animation: ff-slide-in 0.25s ease-out;
    font-family: var(--factory-font-mono);
  }

  .detail-panel__close {
    float: right;
    background: none;
    border: none;
    color: var(--factory-text-muted);
    font-size: var(--factory-text-lg);
    cursor: pointer;
    padding: var(--factory-spacing-xs);
  }

  .detail-panel__close:hover { color: var(--factory-text-primary); }

  .detail-panel__title {
    font-family: var(--factory-font-mono);
    font-size: var(--factory-text-lg);
    font-weight: 700;
    color: var(--factory-text-primary);
    margin: 0 0 var(--factory-spacing-md);
  }

  .detail-panel__loading {
    color: var(--factory-text-muted);
    font-size: var(--factory-text-sm);
  }

  @media (max-width: 767px) {
    .detail-panel {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: 75vh;
      max-height: calc(100vh - 60px - 48px);
      border-left: none;
      border-top: 1px solid var(--factory-border);
      border-radius: var(--factory-radius-md) var(--factory-radius-md) 0 0;
      transform: translateY(100%);
      transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      z-index: 200;
      animation: none;
    }

    .detail-panel.open {
      transform: translateY(0);
    }

    .detail-panel::before {
      content: '';
      display: block;
      width: 36px;
      height: 4px;
      background: var(--factory-border);
      border-radius: 2px;
      margin: 8px auto 12px;
      flex-shrink: 0;
    }

    .detail-panel__close {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
  }

  .detail-panel__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 199;
  }
</style>
