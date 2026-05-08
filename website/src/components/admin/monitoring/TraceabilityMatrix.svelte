<script lang="ts">
  import { onMount } from 'svelte';

  interface MatrixRow { id: string; file: string; category: string; kind: string; lastStatus: string; lastRun: string | null; }

  let matrix: MatrixRow[] = $state([]);
  let filter: string = $state('');
  let loading = $state(true);
  let error: string | null = $state(null);

  onMount(async () => {
    try {
      const res = await fetch('/api/admin/tests/traceability');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { matrix: MatrixRow[] };
      matrix = data.matrix;
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  });

  let filtered = $derived(matrix.filter(r => filter === '' || r.id.toLowerCase().includes(filter.toLowerCase()) || r.file.toLowerCase().includes(filter.toLowerCase())));

  function statusBadge(s: string): string {
    if (s === 'pass') return 'bg-emerald-700 text-emerald-100';
    if (s === 'fail') return 'bg-red-700 text-red-100';
    if (s === 'skip') return 'bg-neutral-700 text-neutral-200';
    return 'bg-neutral-800 text-neutral-400';
  }
</script>

<section class="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
  <header class="mb-3 flex items-baseline justify-between gap-3">
    <h3 class="text-sm font-semibold text-neutral-100">Anforderungs-Abdeckung</h3>
    <input type="search" placeholder="Filter (FA-03, brett…)" bind:value={filter}
           class="w-48 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100" />
  </header>
  {#if loading}<p class="text-xs text-neutral-400">Lade…</p>
  {:else if error}<p class="text-xs text-red-400">Fehler: {error}</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead><tr class="text-left text-neutral-400">
          <th class="py-1">ID</th><th class="py-1">Kategorie</th><th class="py-1">Datei</th><th class="py-1">Status</th><th class="py-1">Letzter Lauf</th>
        </tr></thead>
        <tbody>
          {#each filtered as r (r.id + r.file)}
            <tr class="border-t border-neutral-800">
              <td class="py-1 pr-2 font-mono text-neutral-200">{r.id}</td>
              <td class="py-1 pr-2 text-neutral-400">{r.category}</td>
              <td class="py-1 pr-2 text-neutral-300"><a href="https://github.com/Paddione/Bachelorprojekt/blob/main/{r.file}" target="_blank" rel="noopener" class="hover:underline">{r.file}</a></td>
              <td class="py-1 pr-2"><span class="rounded px-1.5 py-0.5 {statusBadge(r.lastStatus)}">{r.lastStatus}</span></td>
              <td class="py-1 text-neutral-400">{r.lastRun ? new Date(r.lastRun).toLocaleString('de-DE') : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
