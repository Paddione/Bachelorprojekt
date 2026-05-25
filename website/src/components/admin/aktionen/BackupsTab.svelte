<script lang="ts">
  import { onMount } from 'svelte';
  import { apiCall, toast } from '../../../lib/admin-api';

  export let cluster: string = 'mentolder';

  type BackupJob = { name: string; trigger: string; startTime: string | null; completionTime: string | null; succeeded: boolean; failed: boolean };
  let jobs: BackupJob[] = [];
  let loading = true;
  let triggerCluster = cluster ?? 'mentolder';
  let restoreDb = 'website';
  let pending = false;
  let restoreModal: { job: BackupJob; db: string; confirmText: string } | null = null;
  let helpOpen = false;

  async function load() {
    loading = true;
    const r = await apiCall<{ jobs: BackupJob[] }>(`/api/admin/ops/backup/list?cluster=${triggerCluster}`);
    jobs = r.ok ? r.data.jobs : [];
    loading = false;
  }

  async function triggerBackup() {
    pending = true;
    const r = await apiCall(`/api/admin/ops/backup/trigger`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cluster: triggerCluster }),
    });
    if (r.ok) {
      toast('success', 'Backup wird erstellt — erscheint in 1–3 Minuten in der Liste');
      setTimeout(load, 10_000);
    }
    pending = false;
  }

  async function confirmRestore() {
    if (!restoreModal || restoreModal.confirmText !== 'WIEDERHERSTELLEN') return;
    pending = true;
    const r = await apiCall(`/api/admin/ops/restore`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cluster: triggerCluster, db: restoreModal.db, backupJobName: restoreModal.job.name }),
    });
    if (r.ok) toast('success', 'Wiederherstellung gestartet');
    pending = false;
    restoreModal = null;
  }

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex flex-wrap gap-2 items-center">
    <select bind:value={triggerCluster} on:change={load} class="px-3 py-2 rounded-lg bg-admin-surface border border-admin-border text-white" style="min-height: 44px;">
      <option value="mentolder">mentolder</option>
      <option value="korczewski">korczewski</option>
    </select>
    <button on:click={triggerBackup} disabled={pending} class="px-4 py-2 rounded-lg bg-admin-primary text-admin-bg font-bold disabled:opacity-50" style="min-height: 44px;" data-testid="backup-trigger">
      Neues Backup
    </button>
    <button on:click={() => helpOpen = !helpOpen} class="text-admin-text-mute hover:text-white p-2" aria-label="Hilfe" data-testid="backup-help">ℹ️</button>
  </div>
  {#if helpOpen}
    <div class="p-3 bg-admin-sidebar-bg rounded-lg border border-admin-border text-xs text-admin-text-mute">
      Backup-Erstellung dauert 1–3 Minuten. Wiederherstellung überschreibt die aktuelle Datenbank — nur in Notfällen verwenden!
    </div>
  {/if}

  {#if loading}
    <p class="text-admin-text-mute">Lade…</p>
  {:else if jobs.length === 0}
    <p class="text-admin-text-mute">Keine Backup-Jobs vorhanden.</p>
  {:else}
    <table class="w-full text-sm">
      <thead class="text-admin-text-mute text-xs uppercase">
        <tr>
          <th class="text-left p-2">Datum</th>
          <th class="text-left p-2">Trigger</th>
          <th class="text-left p-2">Status</th>
          <th class="text-left p-2">Aktion</th>
        </tr>
      </thead>
      <tbody>
        {#each jobs as j}
          <tr class="border-t border-admin-border">
            <td class="p-2 text-xs">{j.completionTime ? new Date(j.completionTime).toLocaleString('de-DE') : '—'}</td>
            <td class="p-2 text-xs">{j.trigger}</td>
            <td class="p-2">{j.succeeded ? '🟢' : j.failed ? '🔴' : '🟡'}</td>
            <td class="p-2">
              {#if j.succeeded}
                <button on:click={() => restoreModal = { job: j, db: restoreDb, confirmText: '' }} class="px-3 py-1 rounded-md bg-red-700 text-white text-xs font-bold" data-testid="restore-{j.name}">
                  Wiederherstellen
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if restoreModal}
  <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
    <div class="bg-admin-surface p-6 rounded-2xl border border-red-500 max-w-md w-full">
      <h3 class="text-lg font-bold text-red-400 mb-3">Wiederherstellen bestätigen</h3>
      <p class="text-sm text-admin-text-mute mb-3">
        Welche Datenbank soll aus <strong>{restoreModal.job.name}</strong> auf <strong>{triggerCluster}</strong> wiederhergestellt werden?
      </p>
      <select bind:value={restoreModal.db} class="w-full px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-white mb-3">
        {#each ['website', 'keycloak', 'nextcloud', 'vaultwarden', 'docuseal', 'all'] as db}
          <option value={db}>{db}</option>
        {/each}
      </select>
      <p class="text-sm text-admin-text-mute mb-2">Tippe <code class="bg-admin-sidebar-bg px-1 rounded">WIEDERHERSTELLEN</code> zur Bestätigung:</p>
      <input bind:value={restoreModal.confirmText} class="w-full px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-white mb-4" data-testid="restore-confirm-input" />
      <div class="flex gap-2 justify-end">
        <button on:click={() => restoreModal = null} class="px-4 py-2 rounded-lg bg-admin-surface border border-admin-border text-admin-text-mute">Abbrechen</button>
        <button on:click={confirmRestore} disabled={restoreModal.confirmText !== 'WIEDERHERSTELLEN' || pending} class="px-4 py-2 rounded-lg bg-red-700 text-white font-bold disabled:opacity-50" data-testid="restore-confirm-submit">
          {pending ? 'Lädt…' : 'Wiederherstellen'}
        </button>
      </div>
    </div>
  </div>
{/if}
