<script lang="ts">
  let { loading = false, error = null }: { loading?: boolean; error?: string | null } = $props();
</script>
{#if loading}
  <div class="sb sb-loading" role="status">Lädt…</div>
{:else if error}
  <div class="sb sb-error" role="alert">Fehler: {error} <button onclick={() => location.reload()}>neu laden</button></div>
{/if}
<style>
  .sb { padding: 1rem; font-size: 13px; font-family: var(--font-mono, monospace); }
  .sb-error { color: oklch(0.70 0.18 25); }
  .sb-error button { background: none; border: 1px solid currentColor; color: inherit; padding: 2px 8px; border-radius: 3px; cursor: pointer; margin-left: 8px; }
</style>
