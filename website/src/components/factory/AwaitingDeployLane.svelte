<script lang="ts">
  import type { AwaitingDeployItem } from '../../lib/factory-floor';
  import { MOBILE_COL_INDEX } from '../FactoryFloor.svelte';
  let { items = [], mobileColIndex }: { items: AwaitingDeployItem[]; mobileColIndex: number } = $props();
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
        </li>
      {/each}
    </ul>
  {/if}
</section>
