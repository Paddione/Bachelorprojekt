<script lang="ts">
  import { onMount } from 'svelte';
  import TestResultsPanel from '../TestResultsPanel.svelte';

  type StalenessFinding = { system: string; status: 'ok' | 'warning' | 'stale'; issue: string; recommendation?: string };
  type StalenessReport = { id: number; createdAt: string; issueCount: number; reportJson: { findings: StalenessFinding[] } };
  type TestRun = { id: string; tier: string; cluster: string; startedAt: string; finishedAt: string | null; status: string; pass: number | null; fail: number | null; skip: number | null; durationMs: number | null };

  let staleness: StalenessReport | null = null;
  let testRuns: TestRun[] = [];
  let loading = true;

  // Bug ticket modal for staleness
  let selectedFinding: StalenessFinding | null = null;
  let modalDescription = '';
  let modalLoading = false;
  let modalError: string | null = null;
  let modalSuccessId: string | null = null;

  async function fetchAll() {
    loading = true;
    const [stalRes, runsRes] = await Promise.allSettled([
      fetch('/api/admin/staleness-report'),
      fetch('/api/admin/test-runs'),
    ]);
    if (stalRes.status === 'fulfilled' && stalRes.value.ok) staleness = await stalRes.value.json();
    if (runsRes.status === 'fulfilled' && runsRes.value.ok) testRuns = await runsRes.value.json();
    loading = false;
  }

  function openFindingModal(finding: StalenessFinding) {
    selectedFinding = finding;
    modalDescription = `Staleness: ${finding.system} – ${finding.status}: ${finding.issue}${finding.recommendation ? ` Empfehlung: ${finding.recommendation}` : ''}`;
    modalError = null; modalSuccessId = null; modalLoading = false;
  }

  async function submitTicket() {
    modalLoading = true;
    try {
      const res = await fetch('/api/admin/bugs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: modalDescription, category: 'fehler' }),
      });
      const json = await res.json();
      if (!res.ok) { modalError = json.error ?? 'Fehler'; return; }
      modalSuccessId = json.ticketId;
      setTimeout(() => selectedFinding = null, 3000);
    } catch { modalError = 'Netzwerkfehler'; }
    finally { modalLoading = false; }
  }

  function fmtDuration(ms: number | null) {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  }

  async function downloadRun(runId: string, format: 'json' | 'md') {
    const res = await fetch(`/api/admin/tests/results/${runId}?format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${runId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onMount(fetchAll);
</script>

<div class="space-y-6">

  <!-- Staleness full report -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="flex justify-between items-center px-4 py-3 border-b border-gray-700">
      <span class="text-sm font-semibold text-gray-200">
        Staleness-Bericht{staleness ? ` — ${new Date(staleness.createdAt).toLocaleDateString('de-DE')}` : ''}
      </span>
      {#if staleness}
        <span class="text-xs text-gray-400">{staleness.issueCount} Warnungen</span>
      {/if}
    </div>
    {#if staleness?.reportJson?.findings}
      <div class="divide-y divide-gray-700/50">
        {#each staleness.reportJson.findings as finding}
          <div class="grid grid-cols-[130px_80px_1fr_auto] gap-3 px-4 py-2.5 text-sm items-center
            {finding.status !== 'ok' ? 'bg-yellow-900/10' : ''}">
            <span class="text-gray-200">{finding.system}</span>
            <span class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full {finding.status === 'ok' ? 'bg-green-500' : finding.status === 'warning' ? 'bg-yellow-400' : 'bg-red-500'}"></span>
              <span class="{finding.status === 'ok' ? 'text-green-400' : 'text-yellow-400'} text-xs">{finding.status}</span>
            </span>
            <span class="text-gray-400 text-xs">{finding.issue}</span>
            {#if finding.status !== 'ok'}
              <button on:click={() => openFindingModal(finding)}
                class="text-xs text-blue-400 hover:text-blue-300 shrink-0">Ticket</button>
            {:else}
              <span></span>
            {/if}
          </div>
        {/each}
      </div>
    {:else if loading}
      <div class="px-4 py-4 text-sm text-gray-500 text-center">Lädt…</div>
    {:else}
      <div class="px-4 py-4 text-sm text-gray-500 text-center">Kein Bericht vorhanden.</div>
    {/if}
  </div>

  <!-- Test run history -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-700">
      <h3 class="text-sm font-semibold text-gray-200">Testlauf-Historie</h3>
    </div>
    {#if testRuns.length > 0}
      <div class="divide-y divide-gray-700/50">
        <div class="grid grid-cols-[160px_60px_60px_50px_50px_50px_1fr_80px] gap-2 px-4 py-2 text-xs text-gray-500 uppercase tracking-wide">
          <span>Datum</span><span>Tier</span><span>Cluster</span>
          <span class="text-green-400">Pass</span><span class="text-red-400">Fail</span><span>Skip</span>
          <span></span><span>Download</span>
        </div>
        {#each testRuns as run}
          <div class="grid grid-cols-[160px_60px_60px_50px_50px_50px_1fr_80px] gap-2 px-4 py-2.5 text-xs items-center
            {run.status === 'error' ? 'bg-red-900/10' : ''}">
            <span class="text-gray-300">{new Date(run.startedAt).toLocaleString('de-DE')}</span>
            <span class="text-gray-400 font-mono">{run.tier}</span>
            <span class="text-gray-400">{run.cluster}</span>
            <span class="text-green-400">{run.pass ?? '—'}</span>
            <span class="text-red-400">{run.fail ?? '—'}</span>
            <span class="text-gray-400">{run.skip ?? '—'}</span>
            <span class="text-gray-500">{fmtDuration(run.durationMs)}</span>
            <div class="flex gap-2">
              <button on:click={() => downloadRun(run.id, 'json')} class="text-blue-400 hover:text-blue-300">JSON</button>
              <button on:click={() => downloadRun(run.id, 'md')} class="text-blue-400 hover:text-blue-300">MD</button>
            </div>
          </div>
        {/each}
      </div>
    {:else if loading}
      <div class="px-4 py-4 text-sm text-gray-500 text-center">Lädt…</div>
    {:else}
      <div class="px-4 py-4 text-sm text-gray-500 text-center">Noch keine Testläufe.</div>
    {/if}
  </div>

  <!-- Manual test protocols (existing component, unchanged) -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-700">
      <h3 class="text-sm font-semibold text-gray-200">Manuelle Test-Protokolle</h3>
    </div>
    <div class="p-4">
      <TestResultsPanel />
    </div>
  </div>
</div>

<!-- Staleness bug ticket modal -->
{#if selectedFinding}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-5 w-full max-w-md space-y-3">
      <h3 class="font-semibold text-gray-100">Bug-Ticket: {selectedFinding.system}</h3>
      <textarea bind:value={modalDescription} rows={3}
        class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200 resize-none"></textarea>
      {#if modalError}<p class="text-red-400 text-sm">{modalError}</p>{/if}
      {#if modalSuccessId}<p class="text-green-400 text-sm">Ticket {modalSuccessId} erstellt.</p>{/if}
      <div class="flex gap-2 justify-end">
        <button on:click={() => selectedFinding = null} class="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Abbrechen</button>
        <button on:click={submitTicket} disabled={modalLoading}
          class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
          {modalLoading ? '…' : 'Erstellen'}
        </button>
      </div>
    </div>
  </div>
{/if}
