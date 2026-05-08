<script lang="ts">
  import { onMount } from 'svelte';

  interface FlakeRow { testId: string; category: string; recentRuns: Array<{ runId: string; status: string; createdAt: string }>; failureRate: number; }

  let tests: FlakeRow[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);

  onMount(async () => {
    try {
      const res = await fetch('/api/admin/tests/flake?limit=10');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { tests: FlakeRow[] };
      tests = data.tests;
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  });

  function cellClass(status: string): string {
    if (status === 'pass') return 'bg-emerald-500';
    if (status === 'fail') return 'bg-red-500';
    return 'bg-neutral-600';
  }
</script>

<section class="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
  <header class="mb-3 flex items-baseline justify-between">
    <h3 class="text-sm font-semibold text-neutral-100">Flake-Matrix (letzte 10 Läufe)</h3>
    {#if !loading && !error}<span class="text-xs text-neutral-400">{tests.length} Tests</span>{/if}
  </header>
  {#if loading}<p class="text-xs text-neutral-400">Lade…</p>
  {:else if error}<p class="text-xs text-red-400">Fehler: {error}</p>
  {:else if tests.length === 0}<p class="text-xs text-neutral-400">Noch keine Testergebnisse erfasst.</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead><tr class="text-left text-neutral-400">
          <th class="py-1">Test</th><th class="py-1">Kategorie</th><th class="py-1">Failrate</th><th class="py-1">Letzte 10</th>
        </tr></thead>
        <tbody>
          {#each tests as t (t.testId)}
            <tr class="border-t border-neutral-800">
              <td class="py-1 pr-2 font-mono text-neutral-200">{t.testId}</td>
              <td class="py-1 pr-2 text-neutral-400">{t.category}</td>
              <td class="py-1 pr-2 {t.failureRate > 0.3 ? 'text-red-400' : t.failureRate > 0 ? 'text-amber-400' : 'text-emerald-400'}">{(t.failureRate * 100).toFixed(0)}%</td>
              <td class="py-1">
                <div class="flex gap-0.5">
                  {#each t.recentRuns as r}
                    <span class="inline-block h-3 w-3 rounded-sm {cellClass(r.status)}" title="{r.status} · {r.createdAt}"></span>
                  {/each}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
