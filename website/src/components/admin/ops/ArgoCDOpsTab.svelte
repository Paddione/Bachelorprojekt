<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type App = {
    name: string; project: string; syncStatus: string; health: string;
    lastSyncedAt: string | null; operationPhase: string;
  };

  let apps: App[] = [];
  let loading = true;
  let error: string | null = null;
  let syncingApp: string | null = null;
  let syncError: string | null = null;
  let syncSuccess: string | null = null;
  let interval: ReturnType<typeof setInterval>;

  async function load() {
    try {
      loading = apps.length === 0;
      const res = await fetch('/api/admin/cluster/argocd-apps');
      if (res.ok) { const j = await res.json(); apps = j.apps; error = null; }
      else { const j = await res.json().catch(() => ({})); error = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }

  async function sync(appName: string, hard = false) {
    syncingApp = appName; syncError = null; syncSuccess = null;
    try {
      const res = await fetch('/api/admin/ops/argocd/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: appName, hard }),
      });
      const j = await res.json();
      if (!res.ok) { syncError = j.error ?? 'Fehler'; return; }
      syncSuccess = `${appName} Sync gestartet`;
      setTimeout(() => { syncSuccess = null; load(); }, 3000);
    } catch { syncError = 'Netzwerkfehler'; }
    finally { syncingApp = null; }
  }

  function syncCls(s: string) {
    if (s === 'Synced') return 'bg-green-900/40 text-green-300';
    if (s === 'OutOfSync') return 'bg-yellow-900/40 text-yellow-300';
    return 'bg-gray-700 text-gray-400';
  }
  function healthCls(h: string) {
    if (h === 'Healthy') return 'bg-green-900/40 text-green-300';
    if (h === 'Degraded' || h === 'Missing') return 'bg-red-900/40 text-red-300';
    if (h === 'Progressing') return 'bg-blue-900/40 text-blue-300';
    return 'bg-gray-700 text-gray-400';
  }
  function fmtTime(t: string | null) {
    if (!t) return '–';
    const mins = Math.floor((Date.now() - new Date(t).getTime()) / 60000);
    return mins < 60 ? `vor ${mins}m` : `vor ${Math.floor(mins / 60)}h`;
  }

  onMount(() => { load(); interval = setInterval(load, 30_000); });
  onDestroy(() => clearInterval(interval));
</script>

<div class="space-y-4">
  <div class="flex justify-between items-center">
    {#if syncSuccess}<p class="text-green-400 text-sm">{syncSuccess}</p>{:else}<span />{/if}
    <button on:click={load} disabled={loading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {loading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}
  {#if syncError}<p class="text-red-400 text-sm">{syncError}</p>{/if}

  <div class="space-y-2">
    {#each apps as app}
      <div class="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
        <div class="flex-1 min-w-0">
          <span class="text-sm font-mono text-gray-100">{app.name}</span>
          <span class="ml-2 text-xs text-gray-500">{app.project}</span>
        </div>
        <span class="px-2 py-0.5 rounded text-xs {syncCls(app.syncStatus)}">{app.syncStatus}</span>
        <span class="px-2 py-0.5 rounded text-xs {healthCls(app.health)}">{app.health}</span>
        <span class="text-xs text-gray-500 whitespace-nowrap">{fmtTime(app.lastSyncedAt)}</span>
        <div class="flex gap-2">
          <button on:click={() => sync(app.name)} disabled={syncingApp === app.name}
            class="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded">
            {syncingApp === app.name ? '…' : 'Sync'}
          </button>
          <button on:click={() => sync(app.name, true)} disabled={syncingApp === app.name}
            class="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded">
            Hard Refresh
          </button>
        </div>
      </div>
    {/each}
    {#if !loading && apps.length === 0}
      <p class="text-gray-500 text-sm">Keine ArgoCD-Apps gefunden. RBAC korrekt konfiguriert?</p>
    {/if}
  </div>
</div>
