<script lang="ts">
  import type { FloorPayload } from '../../lib/factory-floor';

  let {
    control,
    metrics,
    officeWaiting,
    stagedWaiting,
  }: {
    control: FloorPayload['control'];
    metrics: FloorPayload['metrics'];
    officeWaiting: number;
    stagedWaiting: number;
  } = $props();
</script>

<div class="ff-kpi-grid" data-testid="floor-leitstand">
  <!-- kill switch: special danger/sage state -->
  <div class="ff-kpi" class:ff-kpi--alarm={control.killSwitch} class:ff-kpi--live={!control.killSwitch}>
    <span class="ff-kpi-label">Kill-Switch</span>
    <span class="ff-kpi-val" class:ff-kpi-val--danger={control.killSwitch} class:ff-kpi-val--sage={!control.killSwitch}>
      {control.killSwitch ? 'AN' : 'Aus'}
    </span>
  </div>
  <div class="ff-kpi" data-testid="floor-slots">
    <span class="ff-kpi-label">Slots</span>
    <span class="ff-kpi-val">{control.slotsUsed}<span class="ff-kpi-sub">/{control.slotsCap}</span></span>
  </div>
  <div class="ff-kpi">
    <span class="ff-kpi-label">Daily-Cap</span>
    <span class="ff-kpi-val">{control.dailyUsed}<span class="ff-kpi-sub">/{control.dailyCap}</span></span>
  </div>
  <div class="ff-kpi">
    <span class="ff-kpi-label">Heute</span>
    <span class="ff-kpi-val">{metrics.shippedToday}<span class="ff-kpi-sub"> ships</span></span>
  </div>
  <div class="ff-kpi">
    <span class="ff-kpi-label">Ø Zyklus</span>
    <span class="ff-kpi-val">{metrics.avgCycleH ?? '–'}<span class="ff-kpi-sub"> h</span></span>
  </div>
  <div class="ff-kpi">
    <span class="ff-kpi-label">Watchdog-Stale</span>
    <span class="ff-kpi-val" class:ff-kpi-val--danger={control.watchdogStale > 0}>{control.watchdogStale}</span>
  </div>
  <a href="/admin/planungsbuero" class="ff-kpi ff-kpi--link" data-testid="floor-office" title="Im Planungsbüro">
    <span class="ff-kpi-label">Büro</span>
    <span class="ff-kpi-val" class:ff-kpi-val--brass={officeWaiting > 0}>{officeWaiting ?? 0}</span>
  </a>
  <a href="#floor-kommissionierung" class="ff-kpi ff-kpi--link" data-testid="floor-komm-count" title="Zur Kommissionierung">
    <span class="ff-kpi-label">Kommissionierung</span>
    <span class="ff-kpi-val" class:ff-kpi-val--brass={stagedWaiting > 0}>{stagedWaiting ?? 0}</span>
  </a>
</div>

<style>
  .ff-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }
  @media (min-width: 768px) {
    .ff-kpi-grid { grid-template-columns: repeat(8, 1fr); }
  }

  .ff-kpi {
    background: var(--ink-850, #101826);
    border: 1px solid var(--line, rgba(255,255,255,.07));
    border-radius: var(--radius-md, 10px);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: border-color .18s ease;
  }
  .ff-kpi--link {
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }
  .ff-kpi--link:hover { border-color: var(--line-2, rgba(255,255,255,.12)); }

  .ff-kpi--alarm { border-color: color-mix(in oklab, var(--danger, #d77a6e) 55%, transparent); }
  .ff-kpi--live  { border-color: color-mix(in oklab, var(--sage, #4ade80) 40%, transparent); }

  .ff-kpi-label {
    font-family: var(--mono, monospace);
    font-size: 9.5px;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: var(--mute-2, #6a727e);
  }

  .ff-kpi-val {
    font-family: var(--serif, serif);
    font-size: 26px;
    line-height: 1;
    color: var(--fg, #eef1f3);
  }
  .ff-kpi-sub {
    font-family: var(--mono, monospace);
    font-size: 13px;
    color: var(--mute, #8c96a3);
  }
  .ff-kpi-val--danger { color: var(--danger, #d77a6e); }
  .ff-kpi-val--sage   { color: var(--sage, #4ade80); }
  .ff-kpi-val--brass  { color: var(--brass, #d4a96a); }
</style>
