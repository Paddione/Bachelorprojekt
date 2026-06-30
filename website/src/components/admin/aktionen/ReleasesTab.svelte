<script lang="ts">
  import { onDestroy } from 'svelte';
  import { apiCall, toast } from '../../../lib/admin-api';

  export let cluster: string = 'mentolder';

  const services = [
    { key: 'website', label: 'Website', getNs: (c: string) => c === 'korczewski' ? 'website-korczewski' : 'website' },
    { key: 'docs',    label: 'Docs',    getNs: (c: string) => c === 'korczewski' ? 'workspace-korczewski' : 'workspace' },
    { key: 'brett',   label: 'Brett',   getNs: (c: string) => c === 'korczewski' ? 'workspace-korczewski' : 'workspace' },
  ] as const;

  const clusters: string[] = ['mentolder', 'korczewski'];
  let pending: Record<string, boolean> = {};
  let pollers: ReturnType<typeof setInterval>[] = [];
  let helpOpen: string | null = null;

  async function trigger(svc: typeof services[number], c: string) {
    const key = `${svc.key}-${c}`;
    pending[key] = true; pending = pending;
    const result = await apiCall(`/api/admin/ops/redeploy/${svc.key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cluster: c }),
    });
    if (result.ok) {
      toast('success', `${svc.label} (${c}) wird neu geladen…`);
      setTimeout(() => { pending[key] = false; pending = pending; }, 90_000);
    } else {
      pending[key] = false; pending = pending;
    }
  }

  onDestroy(() => pollers.forEach(clearInterval));
</script>

<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
  {#each services as svc}
    <div class="admin-card p-4">
      <h3 class="text-lg font-bold text-white mb-3">{svc.label}</h3>
      {#each clusters as c}
        {@const key = `${svc.key}-${c}`}
        <div class="mb-4 last:mb-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs uppercase text-admin-text-mute">{c}</span>
          </div>
          <div class="flex gap-2 mt-2 items-center">
            <button
              on:click={() => trigger(svc, c)}
              disabled={pending[key]}
              class="px-3 py-2 rounded-lg bg-admin-primary text-admin-bg text-sm font-bold disabled:opacity-50"
              style="min-height: 44px;"
              data-testid="redeploy-{svc.key}-{c}"
            >
              {pending[key] ? 'Lädt…' : 'Neue Version laden'}
            </button>
            <button
              on:click={() => helpOpen = helpOpen === key ? null : key}
              class="text-admin-text-mute hover:text-white p-2"
              aria-label="Hilfe"
              data-testid="redeploy-help-{svc.key}-{c}"
            >ℹ️</button>
          </div>
          {#if helpOpen === key}
            <div class="mt-2 p-3 bg-admin-sidebar-bg rounded-lg border border-admin-border text-xs text-admin-text-mute">
              Lädt das aktuellste Image-Tag von ghcr.io und startet den Pod neu. Bestehende Anwender-Sitzungen werden ~10 Sekunden unterbrochen. Dauer: 30–90 Sekunden.
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>
