<script lang="ts">
  import type { AwaitingDeployItem } from '../../lib/factory-floor-types';
  import { MOBILE_COL_INDEX } from '../FactoryFloor.svelte';
  let { items = [], mobileColIndex }: { items: AwaitingDeployItem[]; mobileColIndex: number } = $props();

  let deploying = $state<string | null>(null);
  let deployErr = $state<string | null>(null);

  const GH_REPO = 'Paddione/Bachelorprojekt';
  const prUrl = (n: number) => `https://github.com/${GH_REPO}/pull/${n}`;

  async function doDeploy(extId: string) {
    deploying = extId; deployErr = null;
    try {
      const res = await fetch(`/api/factory-floor/${encodeURIComponent(extId)}/deploy`, {
        method: 'POST', credentials: 'same-origin',
      });
      if (!res.ok) { deployErr = `Deploy fehlgeschlagen (${res.status})`; return; }
    } catch { deployErr = 'Netzwerkfehler'; }
    finally { deploying = null; }
  }
</script>

<section class="lg:w-1/5" data-col="awaitingDeploy" class:mobile-visible={mobileColIndex === MOBILE_COL_INDEX.awaitingDeploy} data-testid="floor-awaiting-deploy" id="floor-awaiting-deploy">
  <h3 class="text-sm font-semibold text-muted mb-2">Wartet auf Deploy</h3>
  {#if items.length === 0}
    <p class="text-muted text-xs">Nichts wartet auf Deploy.</p>
  {:else}
    <ul class="space-y-2">
      {#each items as it (it.extId)}
        <li class="rounded-xl bg-amber-500/10 p-3" data-testid="awaiting-deploy-card">
          <p class="text-xs font-mono text-amber-300">{it.extId}{#if it.prNumber} · PR #{it.prNumber}{/if}</p>
          <p class="text-sm">{it.title}</p>
          <div class="mt-2 flex gap-1.5">
            <button type="button" onclick={() => doDeploy(it.extId)} disabled={deploying === it.extId}
                    data-testid="awaiting-deploy-release"
                    class="rounded bg-amber-500/80 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-amber-400 disabled:opacity-50">
              {deploying === it.extId ? '…' : '→ Promoten'}
            </button>
            {#if it.prNumber}
              <a href={prUrl(it.prNumber)} target="_blank" rel="noopener noreferrer"
                 data-testid="awaiting-deploy-pr"
                 class="rounded bg-white/10 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-white/20">
                PR #{it.prNumber} ↗
              </a>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
  {#if deployErr}<p class="mt-2 text-xs text-red-400" data-testid="awaiting-deploy-error">{deployErr}</p>{/if}
</section>
