<!-- website/src/components/LiveStream/StreamOffline.svelte -->
<script lang="ts">
  let { message = 'Kein Stream aktiv' }: { message?: string } = $props();
</script>

<div class="flex flex-col items-center justify-center min-h-[360px] bg-dark-light rounded-xl border border-dark-lighter">
  <div class="text-4xl mb-4">📡</div>
  <p class="text-muted text-lg">{message}</p>
  <p class="text-muted text-sm mt-2">Schaue später wieder rein.</p>
</div>
