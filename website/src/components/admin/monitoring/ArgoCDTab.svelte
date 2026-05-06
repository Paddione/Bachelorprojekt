<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Application = {
    name: string;
    namespace: string;
    project: string;
    destination: { server: string; namespace: string };
    source: { repoURL: string; path: string; targetRevision: string };
    syncStatus: string;
    syncRevision: string;
    health: string;
    healthMessage: string;
    operationPhase: string;
    lastSyncedAt: string | null;
  };

  let apps: Application[] = [];
  let loading = true;
  let error: string | null = null;
  let fetchedAt: string | null = null;
  let refreshInterval: ReturnType<typeof setInterval>;

  async function fetchData() {
    try {
      loading = apps.length === 0;
      const res = await fetch('/api/admin/cluster/argocd-apps');
      if (res.ok) {
        const j = await res.json();
        apps = j.apps;
        fetchedAt = j.fetchedAt;
        error = null;
      } else {
        const j = await res.json().catch(() => ({}));
        error = j.error ?? `Fehler ${res.status}`;
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function syncClass(s: string) {
    if (s === 'Synced') return 'bg-green-900/40 text-green-300';
    if (s === 'OutOfSync') return 'bg-yellow-900/40 text-yellow-300';
    return 'bg-gray-700 text-gray-400';
  }
  function healthClass(h: string) {
    if (h === 'Healthy') return 'bg-green-900/40 text-green-300';
    if (h === 'Progressing') return 'bg-blue-900/40 text-blue-300';
    if (h === 'Degraded' || h === 'Missing') return 'bg-red-900/40 text-red-300';
    if (h === 'Suspended') return 'bg-purple-900/40 text-purple-300';
    return 'bg-gray-700 text-gray-400';
  }
  function shortRev(r: string) { return r ? r.slice(0, 7) : ''; }
  function fmtTime(t: string | null) {
    if (!t) return '–';
    const d = new Date(t);
    const ageMs = Date.now() - d.getTime();
    const m = Math.floor(ageMs / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  onMount(() => {
    fetchData();
    refreshInterval = setInterval(fetchData, 15000);
  });
  onDestroy(() => clearInterval(refreshInterval));

  $: syncedCount = apps.filter(a => a.syncStatus === 'Synced').length;
  $: healthyCount = apps.filter(a => a.health === 'Healthy').length;
  $: outOfSyncCount = apps.filter(a => a.syncStatus !== 'Synced').length;
  $: degradedCount = apps.filter(a => a.health !== 'Healthy' && a.health !== 'Progressing').length;
</script>

<div class="space-y-4">
  <!-- KPI strip -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <div class="bg-gray-800 border border-gray-700 rounded p-3">
      <div class="text-xs text-gray-500 uppercase tracking-wide">Synced</div>
      <div class="text-2xl font-mono text-green-400">{syncedCount}</div>
    </div>
    <div class="bg-gray-800 border border-gray-700 rounded p-3">
      <div class="text-xs text-gray-500 uppercase tracking-wide">Healthy</div>
      <div class="text-2xl font-mono text-green-400">{healthyCount}</div>
    </div>
    <div class="bg-gray-800 border border-gray-700 rounded p-3">
      <div class="text-xs text-gray-500 uppercase tracking-wide">Out of Sync</div>
      <div class="text-2xl font-mono {outOfSyncCount > 0 ? 'text-yellow-400' : 'text-gray-500'}">{outOfSyncCount}</div>
    </div>
    <div class="bg-gray-800 border border-gray-700 rounded p-3">
      <div class="text-xs text-gray-500 uppercase tracking-wide">Degraded</div>
      <div class="text-2xl font-mono {degradedCount > 0 ? 'text-red-400' : 'text-gray-500'}">{degradedCount}</div>
    </div>
  </div>

  <!-- Apps table -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    {#if loading}
      <div class="px-4 py-8 text-center text-sm text-gray-500">Lädt…</div>
    {:else if error}
      <div class="px-4 py-6 text-sm text-red-400">{error}</div>
    {:else if apps.length === 0}
      <div class="px-4 py-8 text-center text-sm text-gray-500">Keine Applications gefunden.</div>
    {:else}
      <div class="grid grid-cols-[1fr_120px_120px_140px_100px_70px] gap-2 px-4 py-2 border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wide">
        <span>Application</span><span>Sync</span><span>Health</span><span>Ziel-Namespace</span><span>Revision</span><span>Letzter Sync</span>
      </div>
      {#each apps as a (a.name)}
        <div class="grid grid-cols-[1fr_120px_120px_140px_100px_70px] gap-2 px-4 py-2.5 text-xs items-center border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30">
          <span class="font-mono text-gray-200 truncate" title={a.source.path || a.source.repoURL}>{a.name}</span>
          <span class="px-1.5 py-0.5 rounded font-mono text-center {syncClass(a.syncStatus)}">{a.syncStatus}</span>
          <span class="px-1.5 py-0.5 rounded font-mono text-center {healthClass(a.health)}" title={a.healthMessage}>{a.health}</span>
          <span class="text-gray-400 font-mono truncate">{a.destination.namespace || '–'}</span>
          <span class="text-gray-500 font-mono">{shortRev(a.syncRevision)}</span>
          <span class="text-gray-500 text-right">{fmtTime(a.lastSyncedAt)}</span>
        </div>
      {/each}
    {/if}
  </div>

  {#if fetchedAt}
    <p class="text-xs text-gray-600">Aktualisiert {new Date(fetchedAt).toLocaleTimeString('de-DE')} · automatisch alle 15s</p>
  {/if}
</div>
