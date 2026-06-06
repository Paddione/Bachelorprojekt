<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface MetricRow { day: string; features_shipped: number; avg_cycle_time_h: number | null; escalations: number; total_features: number; }
  interface ActiveFeature { external_id: string; title: string; priority: string; status: string; pipeline_slot: number | null; }
  interface FlagRow { brand: string; key: string; enabled: boolean; set_by: string | null; }
  interface Payload { brand: string; metrics: MetricRow[]; activeFeatures: ActiveFeature[]; flags: FlagRow[]; fetchedAt: string; }

  let { initial, globalCap }: { initial: Payload | null; globalCap: number } = $props();

  const POLL_MS = 15000;
  let data = $state<Payload | null>(initial);
  let loadError = $state<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    try {
      const res = await fetch('/api/factory-metrics', { credentials: 'same-origin' });
      if (!res.ok) { loadError = `Dashboard nicht erreichbar (${res.status})`; return; }
      data = await res.json() as Payload;
      loadError = null;
    } catch { loadError = 'Netzwerkfehler'; }
  }

  const today = $derived(data?.metrics?.[0] ?? null);
  const slotsUsed = $derived(data?.activeFeatures.filter((f) => f.pipeline_slot != null).length ?? 0);

  onMount(() => { if (!initial) refresh(); timer = setInterval(refresh, POLL_MS); });
  onDestroy(() => { if (timer) clearInterval(timer); });
</script>
<div class="text-light" data-testid="factory-dashboard">
  {#if loadError}
    <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 mb-4">
      {loadError}
      <button onclick={refresh} class="ml-3 underline">Erneut versuchen</button>
    </div>
  {/if}

  {#if !data}
    <p class="text-muted">Dashboard lädt…</p>
  {:else}
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      <div class="rounded-xl bg-white/5 p-4"><p class="text-muted text-sm">Durchsatz (heute)</p><p class="text-3xl font-bold" data-testid="kpi-throughput">{today?.features_shipped ?? 0}</p></div>
      <div class="rounded-xl bg-white/5 p-4"><p class="text-muted text-sm">Ø Zykluszeit</p><p class="text-3xl font-bold" data-testid="kpi-cycle-time">{today?.avg_cycle_time_h ?? '–'}h</p></div>
      <div class="rounded-xl bg-white/5 p-4"><p class="text-muted text-sm">Slot-Auslastung</p><p class="text-3xl font-bold" data-testid="kpi-slot-usage">{slotsUsed}/{globalCap}</p></div>
      <div class="rounded-xl bg-white/5 p-4"><p class="text-muted text-sm">Dark-Features</p><p class="text-3xl font-bold" data-testid="kpi-active-features">{data.flags.length}</p></div>
      <div class="rounded-xl bg-white/5 p-4"><p class="text-muted text-sm">Eskalationen (heute)</p><p class="text-3xl font-bold" data-testid="kpi-escalations">{today?.escalations ?? 0}</p></div>
    </div>

    <h3 class="font-semibold mb-2">Aktive Features</h3>
    <ul class="space-y-1 mb-6">
      {#each data.activeFeatures as f (f.external_id)}
        <li class="flex justify-between rounded bg-white/5 px-3 py-2">
          <span>{f.external_id} — {f.title}</span>
          <span class="text-muted text-sm">{f.priority} · {f.status} · Slot {f.pipeline_slot ?? '–'}</span>
        </li>
      {/each}
    </ul>

    <h3 class="font-semibold mb-2">Dark-Launch Flags</h3>
    <ul class="space-y-1">
      {#each data.flags as fl (fl.key)}
        <li class="flex justify-between rounded bg-white/5 px-3 py-2">
          <span>{fl.key}</span>
          <span class="text-muted text-sm">{fl.enabled ? 'an' : 'aus'} · {fl.set_by ?? '—'}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
