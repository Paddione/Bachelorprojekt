<script lang="ts">
  import { PIPELINE_LANES } from '../../lib/tickets/pipeline-order';
  const shippedLabel = PIPELINE_LANES.find((l) => l.key === 'shipped')?.label ?? 'Versand';

  let {
    shipped,
    mobileColIndex,
    relTime,
    prUrl,
  }: {
    shipped: { extId: string; title: string; prNumber?: number | null; doneAt?: string | null }[];
    mobileColIndex: number;
    relTime: (iso: string | null) => string;
    prUrl: (n: number) => string;
  } = $props();

  let openTitles = $state(new Set<string>());
  function toggleTitle(extId: string) {
    const next = new Set(openTitles);
    if (next.has(extId)) next.delete(extId);
    else next.add(extId);
    openTitles = next;
  }
</script>

<div data-col="done" class:mobile-visible={mobileColIndex === 9} class="lg:w-1/5" data-testid="floor-shipped">
  <h3 class="font-semibold mb-1">{shippedLabel}</h3>
  <p class="text-muted text-[11px] mb-2">Gemergt nach main · Prod-Deploy entkoppelt</p>
  {#if shipped.length === 0}
    <p class="text-muted text-sm">Noch nichts versandt.</p>
  {:else}
    <ul class="space-y-1.5">
      {#each shipped as s (s.extId)}
        <li class="rounded-lg border border-transparent bg-white/5 px-2.5 py-2 text-sm transition-colors hover:border-white/10 hover:bg-white/[0.08]"
            data-testid="floor-shipped-item">
          <div class="flex items-center justify-between gap-2">
            <button type="button" onclick={() => toggleTitle(s.extId)}
                    class="font-mono text-xs text-gold hover:underline"
                    aria-expanded={openTitles.has(s.extId)}
                    title="Titel ein-/ausblenden">{s.extId}</button>
            {#if s.doneAt}
              <span class="whitespace-nowrap text-[10px] text-muted"
                    title={new Date(s.doneAt).toLocaleString('de-DE')}>{relTime(s.doneAt)}</span>
            {/if}
          </div>
          {#if openTitles.has(s.extId)}
            <p class="mt-0.5 block leading-snug" data-testid="floor-shipped-title">{s.title}</p>
          {/if}
          {#if s.prNumber}
            <a href={prUrl(s.prNumber)} target="_blank" rel="noopener noreferrer"
               data-testid="floor-shipped-pr"
               class="mt-1 inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-gold hover:text-dark">
              <svg viewBox="0 0 16 16" class="h-3 w-3" fill="currentColor" aria-hidden="true"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>
              PR #{s.prNumber}<span class="opacity-60">↗</span>
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  @media (max-width: 767px) {
    [data-col] { display: none; }
    [data-col].mobile-visible { display: flex; flex-direction: column; width: 100%; }
  }
</style>
