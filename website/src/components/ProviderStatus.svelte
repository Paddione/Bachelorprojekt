<script lang="ts">
  import type { ProviderStatus } from '../lib/factory-floor-types';

  let { providerHealth }: { providerHealth: ProviderStatus[] } = $props();

  function cooldownLabel(iso: string | null): string {
    if (!iso) return '';
    const min = Math.ceil((new Date(iso).getTime() - Date.now()) / 60000);
    return min > 0 ? `wieder in ${min}min` : '';
  }
</script>

<div class="mb-6 rounded-xl bg-white/5 p-3" data-testid="floor-provider-status">
  <h3 class="font-semibold mb-2 text-sm">Provider-Status</h3>
  {#if !providerHealth || providerHealth.length === 0}
    <p class="text-muted text-xs">Keine Provider-Telemetrie.</p>
  {:else}
    <ul class="space-y-1 text-sm">
      {#each providerHealth as p (p.provider)}
        <li class="flex items-center gap-3" data-testid="provider-row">
          <span class="h-2 w-2 rounded-full {p.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'}"
                title={p.status}></span>
          <span class="font-mono w-24">{p.provider}</span>
          <span class="text-muted w-20">{p.activeAgents}/{p.maxConcurrent} aktiv</span>
          <span class="text-muted flex-1">{p.tiers.join(', ') || '—'}</span>
          {#if p.status === 'cooldown'}<span class="text-amber-400/90 text-xs">{cooldownLabel(p.cooldownUntil)}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
