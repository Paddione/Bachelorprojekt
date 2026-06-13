<script lang="ts">
  import type { Phase } from '../../lib/factory-floor';

  const PHASE_LABEL: Record<Phase, string> = {
    scout: 'Sichten', design: 'Entwurf', plan: 'Planung',
    implement: 'Umsetzung', verify: 'Prüfung', deploy: 'Auslieferung',
  };

  let {
    events,
  }: {
    events: Array<{ phase: string; state: string; driver: string; at: string; detail?: string }>;
  } = $props();

  function fmtTs(iso: string): string {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="dp-events">
  {#each events as e}
    <div class="dp-event">
      <div class="dp-event-dot" class:dp-event-dot--active={e.state === 'entered'}></div>
      <div class="dp-event-body">
        <div class="dp-event-title">
          <span>{PHASE_LABEL[e.phase as Phase] ?? e.phase} · {e.driver}</span>
          <span class="dp-event-time">{fmtTs(e.at)}</span>
        </div>
        <div class="dp-event-state">{e.state}{e.detail ? ` — ${e.detail}` : ''}</div>
      </div>
    </div>
  {/each}
</div>

<style>
  .dp-events {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-bottom: 28px;
  }

  .dp-event {
    display: flex;
    gap: 14px;
    padding-bottom: 16px;
  }

  .dp-event-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--mute-2);
    flex: none;
    margin-top: 4px;
  }
  .dp-event-dot--active { background: var(--brass); }

  .dp-event-body { flex: 1; min-width: 0; }

  .dp-event-title {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
    color: var(--fg);
    font-weight: 500;
    margin-bottom: 3px;
  }

  .dp-event-time {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--mute-2);
    flex: none;
    white-space: nowrap;
  }

  .dp-event-state {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--mute);
  }
</style>
