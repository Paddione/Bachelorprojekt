<script lang="ts">
  import GoalsDashboard from '../../sdlc/GoalsDashboard.svelte';
</script>

<!-- Reiner Re-Export (T007957/E3, p2 Task 1): die Karte laedt sich vollstaendig
     selbst (Befund 1) -- kein State, kein Fetch, keine Props. -->
<section class="deck-qualitaet" data-testid="deck-panel-qualitaet">
  <GoalsDashboard />
</section>

<style>
  .deck-qualitaet {
    padding: var(--ls-space-6, 1.5rem);
  }
</style>
