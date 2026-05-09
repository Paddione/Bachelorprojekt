<script lang="ts">
  import { onMount } from 'svelte';

  type BackupJob = { name: string; trigger: string; startTime: string | null; completionTime: string | null; succeeded: boolean; failed: boolean };

  let cluster = 'mentolder';
  let jobs: BackupJob[] = [];
  let jobsLoading = false;
  let triggerLoading = false;
  let triggerMsg: string | null = null;
  let triggerError: string | null = null;

  let restoreJob: BackupJob | null = null;
  let restoreDb = 'all';
  let restoreLoading = false;
  let restoreError: string | null = null;
  let restoreMsg: string | null = null;
  let confirmRestore = false;

  const DBS = ['all', 'keycloak', 'nextcloud', 'vaultwarden', 'website', 'docuseal'];

  async function loadJobs() {
    jobsLoading = true;
    try {
      const res = await fetch(`/api/admin/ops/backup/list?cluster=${cluster}`);
      const j = await res.json();
      if (res.ok) jobs = j.jobs;
      else triggerError = j.error ?? `Fehler ${res.status}`;
    } catch (e) { triggerError = (e as Error).message; }
    finally { jobsLoading = false; }
  }

  async function triggerBackup() {
    triggerLoading = true; triggerMsg = null; triggerError = null;
    try {
      const res = await fetch('/api/admin/ops/backup/trigger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster }),
      });
      const j = await res.json();
      if (!res.ok) { triggerError = j.error ?? 'Fehler'; return; }
      triggerMsg = `Backup gestartet: ${j.jobName}`;
      setTimeout(() => { triggerMsg = null; loadJobs(); }, 3000);
    } catch { triggerError = 'Netzwerkfehler'; }
    finally { triggerLoading = false; }
  }

  async function doRestore() {
    if (!restoreJob) return;
    restoreLoading = true; restoreError = null;
    try {
      const res = await fetch('/api/admin/ops/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, db: restoreDb, backupJobName: restoreJob.name }),
      });
      const j = await res.json();
      if (!res.ok) { restoreError = j.error ?? 'Fehler'; return; }
      restoreMsg = `Restore-Job gestartet: ${j.jobName}`;
      restoreJob = null; confirmRestore = false;
      setTimeout(() => { restoreMsg = null; loadJobs(); }, 3000);
    } catch { restoreError = 'Netzwerkfehler'; }
    finally { restoreLoading = false; }
  }

  function fmtTime(t: string | null) {
    if (!t) return '–';
    return new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  onMount(loadJobs);
</script>

<div class="space-y-6">
  <div class="flex flex-wrap gap-3 items-end">
    <div>
      <label class="text-xs text-gray-400 block mb-1">Cluster</label>
      <select bind:value={cluster} on:change={loadJobs}
        class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        <option value="mentolder">mentolder.de</option>
        <option value="korczewski">korczewski.de</option>
      </select>
    </div>
    <button on:click={triggerBackup} disabled={triggerLoading}
      class="px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded">
      {triggerLoading ? '…' : '💾 Backup jetzt auslösen'}
    </button>
    <button on:click={loadJobs} disabled={jobsLoading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {jobsLoading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if triggerMsg}<p class="text-green-400 text-sm">{triggerMsg}</p>{/if}
  {#if triggerError}<p class="text-red-400 text-sm">{triggerError}</p>{/if}
  {#if restoreMsg}<p class="text-green-400 text-sm">{restoreMsg}</p>{/if}

  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-gray-700 text-xs text-gray-400">
          <th class="px-4 py-2 text-left">Job</th>
          <th class="px-4 py-2 text-left">Gestartet</th>
          <th class="px-4 py-2 text-left">Abgeschlossen</th>
          <th class="px-4 py-2 text-left">Status</th>
          <th class="px-4 py-2 text-left">Aktion</th>
        </tr>
      </thead>
      <tbody>
        {#each jobs as job}
          <tr class="border-b border-gray-700/50 hover:bg-gray-700/30">
            <td class="px-4 py-2 font-mono text-xs text-gray-300">{job.name}</td>
            <td class="px-4 py-2 text-xs text-gray-400">{fmtTime(job.startTime)}</td>
            <td class="px-4 py-2 text-xs text-gray-400">{fmtTime(job.completionTime)}</td>
            <td class="px-4 py-2">
              {#if job.succeeded}
                <span class="text-xs text-green-400">✓ Erfolgreich</span>
              {:else if job.failed}
                <span class="text-xs text-red-400">✗ Fehlgeschlagen</span>
              {:else}
                <span class="text-xs text-yellow-400">⏳ Läuft</span>
              {/if}
            </td>
            <td class="px-4 py-2">
              {#if job.succeeded}
                <button on:click={() => { restoreJob = job; restoreError = null; confirmRestore = false; }}
                  class="px-2 py-0.5 text-xs bg-orange-700 hover:bg-orange-600 text-white rounded">
                  Wiederherstellen
                </button>
              {/if}
            </td>
          </tr>
        {/each}
        {#if jobs.length === 0 && !jobsLoading}
          <tr><td colspan="5" class="px-4 py-4 text-center text-gray-500 text-xs">Keine Backup-Jobs gefunden</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

{#if restoreJob}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-base font-semibold text-white mb-2">Datenbank wiederherstellen</h3>
      <p class="text-sm text-gray-300 mb-1">
        Aus Backup: <span class="font-mono text-blue-300">{restoreJob.name}</span>
      </p>
      <p class="text-xs text-gray-500 mb-4">Gestartet: {fmtTime(restoreJob.startTime)}</p>

      <div class="mb-4">
        <label class="text-xs text-gray-400 block mb-1">Datenbank</label>
        <select bind:value={restoreDb}
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm">
          {#each DBS as db}<option value={db}>{db === 'all' ? 'Alle' : db}</option>{/each}
        </select>
      </div>

      <div class="bg-red-900/30 border border-red-700 rounded p-3 mb-4">
        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={confirmRestore} class="mt-0.5 rounded" />
          <span class="text-xs text-red-300">
            Achtung: Diese Aktion überschreibt die aktuelle Datenbank unwiderruflich. Ich habe verstanden, dass alle neueren Daten verloren gehen.
          </span>
        </label>
      </div>

      {#if restoreError}<p class="text-red-400 text-sm mb-3">{restoreError}</p>{/if}
      <div class="flex gap-3 justify-end">
        <button on:click={() => restoreJob = null}
          class="px-4 py-2 text-sm text-gray-300 hover:text-white">Abbrechen</button>
        <button on:click={doRestore} disabled={!confirmRestore || restoreLoading}
          class="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded">
          {restoreLoading ? 'Lädt…' : 'Jetzt wiederherstellen'}
        </button>
      </div>
    </div>
  </div>
{/if}
