<script lang="ts">
  let {
    staged,
    stagedWaiting: _stagedWaiting,
    releasing,
    releaseErr,
    manualHintFor,
    mobileColIndex,
    onOpenDetail,
    onReleaseToFactory,
    onToggleManualHint,
    relTime,
    prioDot,
    planUrl,
    ticketUrl,
  }: {
    staged: { extId: string; title: string; priority: string; branch?: string | null; planPath?: string | null; createdAt?: string | null }[];
    stagedWaiting: number;
    releasing: string | null;
    releaseErr: string | null;
    manualHintFor: string | null;
    mobileColIndex: number;
    onOpenDetail: (extId: string) => void;
    onReleaseToFactory: (extId: string) => void;
    onToggleManualHint: (extId: string) => void;
    relTime: (iso: string | null) => string;
    prioDot: (p: string) => string;
    planUrl: (branch: string, planPath: string) => string;
    ticketUrl: (extId: string) => string;
  } = $props();
</script>

<div data-col="staged" class:mobile-visible={mobileColIndex === 0} class="lg:w-1/5 scroll-mt-24" id="floor-kommissionierung" data-testid="floor-kommissionierung">
  <h3 class="font-semibold mb-2">Kommissionierung</h3>
  {#if staged.length === 0}
    <p class="text-muted text-sm">Nichts kommissioniert.</p>
  {:else}
    <ul class="space-y-1.5">
      {#each staged as s (s.extId)}
        <li class="rounded-lg border border-transparent bg-white/5 px-2.5 py-2 text-sm transition-colors hover:border-white/10 hover:bg-white/[0.08]"
            data-testid="floor-staged-item">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="h-2 w-2 shrink-0 rounded-full {prioDot(s.priority)}" title={`Priorität: ${s.priority}`}></span>
              <a href={ticketUrl(s.extId)} class="font-mono text-xs text-gold hover:underline"
                 title="In der Ticket-Übersicht öffnen">{s.extId}</a>
            </div>
            {#if s.createdAt}
              <span class="whitespace-nowrap text-[10px] text-muted"
                    title={new Date(s.createdAt).toLocaleString('de-DE')}>{relTime(s.createdAt)}</span>
            {/if}
          </div>
          <button type="button" onclick={() => onOpenDetail(s.extId)}
                  class="mt-0.5 block w-full text-left leading-snug transition-colors hover:text-gold"
                  title="Phasen-Timeline &amp; Details anzeigen">{s.title}</button>
          {#if s.branch && s.planPath}
            <a href={planUrl(s.branch, s.planPath)} target="_blank" rel="noopener noreferrer"
               data-testid="floor-staged-plan"
               class="mt-1 inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-gold hover:text-dark"
               title={`Branch ${s.branch} · Plan ansehen`}>
              <svg viewBox="0 0 16 16" class="h-3 w-3" fill="currentColor" aria-hidden="true"><path d="M11.75 1.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM4.25 1.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM4.25 11a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5ZM3.5 6.5v3h1.5v-3H3.5Zm8.25-1.25a3.25 3.25 0 0 1-3.25 3.25H5v1.5h3.5A4.75 4.75 0 0 0 13.25 5.25h-1.5Z"/></svg>
              {s.branch}<span class="opacity-60">↗</span>
            </a>
          {:else}
            <span class="mt-1 block text-[10px] text-muted">⚠ kein Plan-Ref</span>
          {/if}
          <div class="mt-1.5 flex gap-1.5">
            <button type="button" onclick={() => onReleaseToFactory(s.extId)} disabled={releasing === s.extId}
                    data-testid="floor-staged-release"
                    class="rounded bg-emerald-500/80 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-emerald-400 disabled:opacity-50">
              {releasing === s.extId ? '…' : '→ Factory'}
            </button>
            <button type="button" onclick={() => onToggleManualHint(s.extId)}
                    data-testid="floor-staged-manual"
                    class="rounded bg-white/10 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-white/20">
              → Manuell
            </button>
          </div>
          {#if manualHintFor === s.extId}
            <p class="mt-1 rounded bg-white/5 px-2 py-1 text-[10px] text-muted" data-testid="floor-staged-manual-hint">
              Lokal <code class="text-gold">dev-flow-execute</code> auf <code class="text-gold">{s.branch ?? 'feature/<branch>'}</code> aufrufen.
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if releaseErr}<p class="mt-2 text-xs text-red-400" data-testid="floor-staged-error">{releaseErr}</p>{/if}
</div>

<style>
  @media (max-width: 767px) {
    [data-col] { display: none; }
    [data-col].mobile-visible { display: flex; flex-direction: column; width: 100%; }
  }
</style>
