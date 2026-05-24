<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let cluster: string;

  let data: any = null;
  let loading = true;
  let error: string | null = null;
  let syncing: string | null = null;
  let syncedOk = new Set<string>();
  let pollInterval: ReturnType<typeof setInterval>;

  function relativeTime(raw: string | null | undefined): string {
    if (!raw) return 'Nie';
    // git revision like "main@sha1:abc..." is not a timestamp
    if (raw.includes('@sha1:') || raw.includes('@sha256:')) {
      return raw.split('@')[0] + ' (kein Trigger)';
    }
    const ms = Date.now() - new Date(raw).getTime();
    if (isNaN(ms)) return raw;
    const s = Math.floor(ms / 1000);
    if (s < 60) return 'vor wenigen Sekunden';
    const m = Math.floor(s / 60);
    if (m < 60) return `vor ${m} Min.`;
    const h = Math.floor(m / 60);
    if (h < 24) return `vor ${h} Std.`;
    return `vor ${Math.floor(h / 24)} Tagen`;
  }

  async function fetchFlux() {
    try {
      const r = await fetch('/api/admin/platform/status');
      if (!r.ok) throw new Error('Status fetch failed');
      data = await r.json();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function triggerSync(name: string, namespace: string) {
    syncing = name;
    syncedOk.delete(name);
    try {
      const r = await fetch('/api/admin/platform/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, namespace })
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      syncedOk = new Set([...syncedOk, name]);
      // Flux needs ~5–15s to reconcile and update lastHandledReconcileAt
      setTimeout(() => { fetchFlux(); syncedOk.delete(name); syncedOk = new Set(syncedOk); }, 10_000);
    } catch (e: any) {
      error = `Sync fehlgeschlagen: ${e.message}`;
      setTimeout(() => { error = null; }, 5000);
    } finally {
      syncing = null;
    }
  }

  onMount(() => {
    fetchFlux();
    pollInterval = setInterval(fetchFlux, 30_000);
  });

  onDestroy(() => clearInterval(pollInterval));
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold text-white">GitOps Pipeline (FluxCD)</h3>
    <button on:click={fetchFlux} class="text-xs text-admin-primary hover:underline">Aktualisieren</button>
  </div>

  {#if loading}
    <div class="animate-pulse space-y-4">
      <div class="h-24 bg-admin-surface rounded-xl"></div>
      <div class="h-24 bg-admin-surface rounded-xl"></div>
    </div>
  {:else if data && data.flux.error && !data.flux.kustomizations?.length}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
      {data.flux.error}
    </div>
  {:else if data}
    {#if error}
      <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs mb-2">{error}</div>
    {/if}
    <div class="grid grid-cols-1 gap-4">
      {#each data.flux.kustomizations as ks}
        <div class="admin-card flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="p-3 rounded-xl bg-admin-surface border border-admin-border">
              <svg class="w-6 h-6 {ks.status === 'ready' ? 'text-green-500' : 'text-red-500'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div>
              <h4 class="font-bold text-white">{ks.name}</h4>
              <p class="text-xs text-admin-text-mute">{ks.namespace} · letzter Sync: {relativeTime(ks.lastAttempt)}</p>
              {#if ks.message}
                <p class="text-[10px] text-red-400 mt-1 truncate max-w-md">{ks.message}</p>
              {/if}
            </div>
          </div>

          <button
            on:click={() => triggerSync(ks.name, ks.namespace)}
            disabled={syncing === ks.name}
            class="px-4 py-2 rounded-lg text-xs font-bold transition-all min-w-[120px]
              {syncedOk.has(ks.name)
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-admin-primary/10 border border-admin-primary/20 text-admin-primary hover:bg-admin-primary/20'}
              disabled:opacity-50"
          >
            {syncing === ks.name ? '⏳ Triggering…' : syncedOk.has(ks.name) ? '✓ Triggered' : 'Reconcile'}
          </button>
        </div>
      {/each}
    </div>

    {#if data.flux.imagePolicies.length > 0}
      <h4 class="text-sm font-bold text-admin-text-disabled uppercase tracking-widest mt-8">Image Updates</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each data.flux.imagePolicies as ip}
          <div class="p-4 rounded-xl bg-admin-surface border border-admin-border">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-white">{ip.name}</span>
              <div class="w-2 h-2 rounded-full {ip.status === 'ready' ? 'bg-green-500' : 'bg-red-500'}"></div>
            </div>
            <p class="text-[10px] font-mono text-admin-text-mute truncate">{ip.latestImage || 'No image found'}</p>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
