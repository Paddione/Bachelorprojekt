<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiCall, toast } from '../../../lib/admin-api';

  export let cluster: string = 'mentolder';

  type Collection = { id: string; name: string; chunk_count: number; last_indexed_at: string | null; embedding_model: string };
  type AuditAction = { target?: string; status: string };

  let collections: Collection[] = [];
  let loading = true;
  let pending: Record<string, boolean> = {};
  let helpOpen = false;
  let pollers: ReturnType<typeof setInterval>[] = [];

  async function load() {
    const r = await apiCall<Collection[]>('/api/admin/knowledge/collections');
    collections = r.ok ? r.data : [];
    loading = false;
  }

  async function trigger(c: Collection) {
    pending[c.id] = true; pending = pending;
    const r = await apiCall<{ job_name: string }>('/api/admin/ops/ai/reindex', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: c.id }),
    });
    if (r.ok) {
      toast('success', `Reindex von "${c.name}" gestartet`);
      const poller = setInterval(async () => {
        const status = await apiCall<{ actions: AuditAction[] }>(`/api/admin/ops/audit/log?action_filter=ai_reindex&limit=5`);
        if (status.ok) {
          const last = status.data.actions?.find((a) => a.target === c.id);
          if (last && (last.status === 'success' || last.status === 'failed')) {
            clearInterval(poller); pending[c.id] = false; pending = pending; load();
          }
        }
      }, 10000);
      pollers.push(poller);
      setTimeout(() => { clearInterval(poller); pending[c.id] = false; pending = pending; }, 15 * 60 * 1000);
    } else {
      pending[c.id] = false; pending = pending;
    }
  }

  onMount(load);
  onDestroy(() => pollers.forEach(clearInterval));
</script>

<div class="space-y-4">
  <div class="flex items-center gap-2">
    <h3 class="text-white font-bold">Collections</h3>
    <button on:click={() => helpOpen = !helpOpen} class="text-admin-text-mute hover:text-white p-2" aria-label="Hilfe">ℹ️</button>
  </div>
  {#if helpOpen}
    <div class="p-3 bg-admin-sidebar-bg rounded-lg border border-admin-border text-xs text-admin-text-mute">
      Reindex liest alle Dokumente erneut und berechnet Embeddings neu. Dauer 2–10 Minuten je nach Collection-Größe. Während des Reindex sind Suchen ggf. langsamer.
    </div>
  {/if}
  {#if loading}
    <p class="text-admin-text-mute">Lade…</p>
  {:else if collections.length === 0}
    <p class="text-admin-text-mute">Keine Collections vorhanden.</p>
  {:else}
    <table class="w-full text-sm">
      <thead class="text-admin-text-mute text-xs uppercase">
        <tr><th class="text-left p-2">Collection</th><th class="text-left p-2">Letzter Index</th><th class="text-left p-2">Chunks</th><th class="text-left p-2">Modell</th><th class="text-left p-2">Aktion</th></tr>
      </thead>
      <tbody>
        {#each collections as c}
          <tr class="border-t border-admin-border">
            <td class="p-2">{c.name}</td>
            <td class="p-2 text-xs">{c.last_indexed_at ? new Date(c.last_indexed_at).toLocaleString('de-DE') : '—'}</td>
            <td class="p-2">{c.chunk_count}</td>
            <td class="p-2 text-xs">{c.embedding_model}</td>
            <td class="p-2">
              <button on:click={() => trigger(c)} disabled={pending[c.id]} class="px-3 py-1 rounded-md bg-admin-primary text-admin-bg text-xs font-bold disabled:opacity-50" style="min-height: 44px;" data-testid="reindex-{c.name.replace(/\s+/g, '-').toLowerCase()}">
                {pending[c.id] ? 'Indexiert…' : 'Neu indexieren'}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
