<script lang="ts">
  import type { LiveState } from '../../lib/live-state';

  let state = $state<LiveState>('empty');
</script>

<div class="text-light" data-testid="live-cockpit" data-state={state}>
  <h1 class="text-2xl font-serif mb-4">Live</h1>
  <p class="text-muted">Cockpit lädt…</p>
</div>
