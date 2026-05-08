<script lang="ts">
  import { onMount } from 'svelte';
  import TestResultsPanel from '../TestResultsPanel.svelte';

  type TestRun = { id: string; tier: string; cluster: string; startedAt: string; finishedAt: string | null; status: string; pass: number | null; fail: number | null; skip: number | null; durationMs: number | null };

  let testRuns: TestRun[] = [];
  let loading = true;

  async function fetchAll() {
    loading = true;
    const runsRes = await fetch('/api/admin/test-runs').catch(() => null);
    if (runsRes?.ok) testRuns = await runsRes.json();
    loading = false;
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
