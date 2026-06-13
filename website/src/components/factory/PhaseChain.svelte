<script lang="ts">
  import type { Phase } from '../../lib/factory-floor';

  const PHASE_ORDER: Phase[] = ['scout', 'design', 'plan', 'implement', 'verify', 'deploy'];
  const PHASE_LABEL: Record<Phase, string> = {
    scout: 'Sichten', design: 'Entwurf', plan: 'Planung',
    implement: 'Umsetzung', verify: 'Prüfung', deploy: 'Auslieferung',
  };

  let {
    events,
  }: {
    events: Array<{ phase: string; state: string }>;
  } = $props();

  function phaseDotState(phase: Phase): 'active' | 'done' | 'future' {
    const currentPhase = events[0]?.phase;
    const currentIdx = currentPhase ? PHASE_ORDER.indexOf(currentPhase as Phase) : -1;
    const phaseIdx = PHASE_ORDER.indexOf(phase);
    if (phaseIdx < 0) return 'future';
    if (events.some((e) => e.phase === phase && e.state === 'done')) return 'done';
    if (phaseIdx === currentIdx) return 'active';
    if (phaseIdx < currentIdx) return 'done';
    return 'future';
  }
</script>

<div class="dp-phase-chain">
  {#each PHASE_ORDER as phase, i (phase)}
    {@const state = phaseDotState(phase)}
    {#if i > 0}
      <span
        class="dp-phase-line"
        class:dp-phase-line--done={state !== 'future' || phaseDotState(PHASE_ORDER[i - 1]) !== 'future'}
      ></span>
    {/if}
    <div class="dp-phase-step">
      <span
        class="dp-phase-dot"
        class:dp-phase-dot--active={state === 'active'}
        class:dp-phase-dot--done={state === 'done'}
        title={PHASE_LABEL[phase]}
      ></span>
      <span class="dp-phase-name">{PHASE_LABEL[phase]}</span>
    </div>
  {/each}
</div>

<style>
  .dp-phase-chain {
    display: flex;
    align-items: flex-start;
    margin-bottom: 30px;
  }

  .dp-phase-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: none;
    position: relative;
  }

  .dp-phase-line {
    flex: 1;
    height: 1px;
    background: var(--line-2);
    align-self: flex-start;
    margin-top: 6px;
  }
  .dp-phase-line--done { background: var(--brass); }

  .dp-phase-dot {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--ink-750);
    border: 1px solid var(--line-2);
    flex: none;
    transition: background var(--dur-base) var(--ease-soft), border-color var(--dur-base) var(--ease-soft), box-shadow var(--dur-base) var(--ease-soft);
  }
  .dp-phase-dot--active {
    background: var(--brass);
    border-color: var(--brass);
    box-shadow: 0 0 14px -2px var(--brass);
  }
  .dp-phase-dot--done {
    background: color-mix(in oklab, var(--brass) 55%, var(--ink-850));
    border-color: var(--brass);
  }

  .dp-phase-name {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--mute-2);
    margin-top: 7px;
    text-align: center;
    line-height: 1.2;
    letter-spacing: .02em;
    max-width: 50px;
    word-break: break-word;
  }
</style>
