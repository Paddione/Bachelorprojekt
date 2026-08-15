<script lang="ts">
  import type { WorkflowTrack } from '../../lib/workflow-status';

  let { tracks = [] as WorkflowTrack[] } = $props<{ tracks?: WorkflowTrack[] }>();

  const STORAGE_KEY = 'wf-minimap-collapsed';

  // Collapse state — persisted so the user's choice survives navigation.
  let collapsed = $state(false);
  $effect(() => {
    try {
      collapsed = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* SSR / privacy mode — default open */
    }
  });

  function toggle() {
    collapsed = !collapsed;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  // Count of tracks that still need attention (anything not done/empty).
  const openCount = $derived(
    tracks.filter((t: WorkflowTrack) => t.status === 'offen' || t.status === 'geplant').length,
  );

  const statusText: Record<WorkflowTrack['status'], string> = {
    offen: 'offen',
    geplant: 'geplant',
    erledigt: 'erledigt',
    leer: 'nichts offen',
  };

  /** Per-step class: completed steps before the current, the current ("du bist
   *  hier"), and not-yet-reached steps. */
  function stepClass(track: WorkflowTrack, index: number): string {
    const step = index + 1; // 1-based
    if (track.status === 'erledigt') return 'wf-step done';
    if (step < track.stage.current) return 'wf-step done';
    if (step === track.stage.current) return 'wf-step here';
    return 'wf-step';
  }

  function trackAria(track: WorkflowTrack): string {
    return `${track.label}: ${statusText[track.status]}, Schritt ${track.stage.current} von ${track.stage.total}`;
  }
</script>

{#if tracks.length > 0}
  <aside
    class="wf-minimap"
    role="complementary"
    aria-label="Workflow-Status-Minimap"
    data-testid="workflow-minimap"
  >
    <button
      type="button"
      class="wf-minimap-header"
      aria-expanded={!collapsed}
      aria-controls="wf-minimap-body"
      onclick={toggle}
    >
      <span class="wf-minimap-eyebrow">Mein Workflow</span>
      {#if openCount > 0}
        <span class="wf-minimap-count" aria-label={`${openCount} offene Schritte`}>{openCount}</span>
      {/if}
      <span class="wf-minimap-chevron" class:collapsed aria-hidden="true">▾</span>
    </button>

    {#if !collapsed}
      <div class="wf-minimap-body" id="wf-minimap-body">
        {#each tracks as track (track.key)}
          <a
            class="wf-track"
            href={track.href}
            aria-label={trackAria(track)}
            aria-current={track.status === 'offen' || track.status === 'geplant' ? 'step' : undefined}
          >
            <span class="wf-track-emoji" aria-hidden="true">{track.emoji}</span>
            <span class="wf-track-main">
              <span class="wf-track-label">{track.label}</span>
              <span class="wf-progress" aria-hidden="true">
                {#each Array(track.stage.total) as _, i (i)}
                  <span class={stepClass(track, i)}></span>
                {/each}
              </span>
            </span>
            <span class={`wf-badge ${track.status}`}>{statusText[track.status]}</span>
          </a>
        {/each}
      </div>
    {/if}
  </aside>
{/if}
