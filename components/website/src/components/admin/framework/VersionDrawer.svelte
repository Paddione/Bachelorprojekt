<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    contentKey: string;
  }

  let { contentKey }: Props = $props();

  interface Version {
    id: number;
    editor: string;
    createdAt: string;
  }

  let versions = $state<Version[]>([]);
  let loading = $state(true);
  let errorMsg = $state('');
  let restoringId = $state<number | null>(null);

  onMount(async () => {
    try {
      const res = await fetch(`/api/admin/content/versions?key=${encodeURIComponent(contentKey)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      versions = await res.json();
    } catch (e) {
      errorMsg = `Verlauf konnte nicht geladen werden: ${e instanceof Error ? e.message : 'Unbekannter Fehler'}`;
    } finally {
      loading = false;
    }
  });

  async function restore(versionId: number) {
    restoringId = versionId;
    try {
      const res = await fetch('/api/admin/content/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentKey, versionId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      window.location.reload();
    } catch (e) {
      alert(`Wiederherstellen fehlgeschlagen: ${e instanceof Error ? e.message : 'Unbekannter Fehler'}`);
    } finally {
      restoringId = null;
    }
  }
</script>

<div class="mt-4 p-4 bg-dark-light border border-dark-lighter rounded-xl space-y-3">
  <h4 class="text-sm font-semibold text-light">Versionsverlauf</h4>

  {#if loading}
    <p class="text-xs text-muted">Lade Versionen…</p>
  {:else if errorMsg}
    <p class="text-xs text-red-400">{errorMsg}</p>
  {:else if versions.length === 0}
    <p class="text-xs text-muted">Noch keine Versionen</p>
  {:else}
    <ul class="space-y-2">
      {#each versions as v (v.id)}
        <li class="flex items-center justify-between gap-3 p-2 bg-dark rounded-lg border border-dark-lighter">
          <div class="min-w-0">
            <span class="text-xs text-light truncate block">{v.editor}</span>
            <span class="text-xs text-muted">{new Date(v.createdAt).toLocaleString('de-DE')}</span>
          </div>
          <button
            onclick={() => restore(v.id)}
            disabled={restoringId === v.id}
            class="flex-shrink-0 px-3 py-1 text-xs bg-dark border border-dark-lighter text-muted hover:text-light hover:border-gold/50 rounded-lg disabled:opacity-50 transition-colors"
          >
            {restoringId === v.id ? 'Wird wiederhergestellt…' : 'Wiederherstellen'}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
