<script lang="ts">
  import { onMount } from 'svelte';

  export let cluster: string;

  interface Pipeline {
    id: string;
    light: 'green' | 'yellow' | 'red' | 'gray';
    lastRun: string | null;
    lastSuccessfulUpload: string | null;
    succeeded: number;
    failed: number;
    active: number;
    schedule: string | null;
  }

  let pipelines: Pipeline[] = [];
  let loading = true;
  let error: string | null = null;

  async function fetchStatus() {
    loading = true;
    error = null;
    try {
      const r = await fetch('/api/admin/backup-status');
      if (!r.ok) throw new Error(`Backup-Status nicht verfügbar (${r.status})`);
      const data = await r.json();
      pipelines = data.pipelines ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Backup-Status nicht verfügbar';
    } finally {
      loading = false;
    }
  }

  onMount(fetchStatus);

  function lightClass(light: string): string {
    return {
      green: 'bg-green-500',
      yellow: 'bg-yellow-500',
      red: 'bg-red-500',
      gray: 'bg-gray-500',
    }[light] ?? 'bg-gray-500';
  }

  function lightLabel(light: string): string {
    return {
      green: 'OK',
      yellow: 'Verzögert',
      red: 'Fehlgeschlagen',
      gray: 'Keine Daten',
    }[light] ?? 'Unbekannt';
  }

  function lightBadgeClass(light: string): string {
    return {
      green: 'bg-green-500/10 text-green-500',
      yellow: 'bg-yellow-500/10 text-yellow-500',
      red: 'bg-red-500/10 text-red-400',
      gray: 'bg-gray-500/10 text-gray-400',
    }[light] ?? 'bg-gray-500/10 text-gray-400';
  }

  function formatTime(ts: string | null): string {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function pipelineLabel(id: string): string {
    return id === 'db-backup' ? 'DB-Backup' : 'PVC-Backup';
  }
</script>

<div class="admin-card">
  <div class="flex items-center justify-between mb-4">
    <h4 class="text-sm font-bold text-white">Backup-Status</h4>
    <button on:click={fetchStatus} class="text-xs text-admin-primary hover:underline">Aktualisieren</button>
  </div>

  {#if loading}
    <div class="animate-pulse space-y-3">
      {#each [1, 2] as _}
        <div class="h-14 bg-admin-surface rounded-xl"></div>
      {/each}
    </div>
  {:else if error}
    <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs">
      {error}
    </div>
  {:else if pipelines.length === 0}
    <div class="p-3 bg-admin-surface rounded-xl text-admin-text-mute text-xs text-center">
      Keine Backup-Pipelines konfiguriert.
    </div>
  {:else}
    <div class="space-y-3">
      {#each pipelines as p}
        <div class="p-3 rounded-xl bg-black/20 border border-white/5">
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-2">
              <div class="w-2.5 h-2.5 rounded-full {lightClass(p.light)}"></div>
              <span class="text-sm font-medium text-white">{pipelineLabel(p.id)}</span>
            </div>
            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase {lightBadgeClass(p.light)}">
              {lightLabel(p.light)}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-admin-text-mute">
            <span>Letzter Lauf</span>
            <span class="text-admin-text-disabled text-right">{formatTime(p.lastRun)}</span>
            <span>Letzter Upload</span>
            <span class="text-admin-text-disabled text-right">{formatTime(p.lastSuccessfulUpload)}</span>
            {#if p.schedule}
              <span>Schedule</span>
              <span class="text-admin-text-disabled text-right font-mono">{p.schedule}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
