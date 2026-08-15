<script lang="ts">
  import type { ActivePoll } from '../../../lib/live-state';

  let { pollActive }: { pollActive: ActivePoll | null } = $props();

  type Results = { poll: { id: string; question: string; kind: string }; total: number; counts: { answer: string; count: number }[] };
  let results = $state<Results | null>(null);

  $effect(() => {
    if (!pollActive) { results = null; return; }
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetch(`/api/admin/poll/${pollActive!.id}`);
        if (r.ok && !cancelled) results = await r.json() as Results;
      } catch {}
    }
    tick();
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  });

  async function shareAndClose() {
    if (!pollActive) return;
    await fetch(`/api/admin/poll/${pollActive.id}/share`, { method: 'POST' });
  }
</script>

{#if pollActive && results}
  <div data-testid="poll-overlay-panel" class="bg-dark-light border border-dark-lighter rounded-2xl p-4">
    <div class="flex items-start justify-between mb-3">
      <div>
        <span class="text-xs text-muted uppercase tracking-wide">Aktive Umfrage</span>
        <p class="font-serif text-light mt-0.5 text-sm">{pollActive.question}</p>
      </div>
      <span class="text-sm text-muted ml-4 flex-shrink-0">{results.total} Antwort{results.total!==1?'en':''}</span>
    </div>

    {#if pollActive.kind === 'multiple_choice'}
      <div class="flex flex-col gap-2 mb-4 text-sm">
        {#each results.counts as c}
          {@const pct = results.total > 0 ? Math.round(c.count / results.total * 100) : 0}
          <div class="flex items-center gap-2">
            <span class="w-28 flex-shrink-0 truncate text-light">{c.answer}</span>
            <div class="flex-1 bg-dark rounded h-2"><div class="h-full bg-gold rounded" style="width:{pct}%"></div></div>
            <span class="w-6 text-right text-muted">{c.count}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-muted text-xs mb-4">{results.total} Freitext-Antwort{results.total!==1?'en':''} eingegangen</p>
    {/if}

    <div class="flex gap-2 justify-end">
      <button onclick={shareAndClose}
        class="px-3 py-1.5 text-sm rounded-lg bg-gold text-dark font-semibold hover:bg-gold/90">
        📤 Ergebnisse teilen &amp; schließen
      </button>
    </div>
  </div>
{/if}
