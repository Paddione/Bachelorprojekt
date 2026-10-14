<script lang="ts">
  import { onMount } from 'svelte';

  interface ServingEndpoint {
    url: string;
    ok: boolean;
    model: string;
    running: number;
    waiting: number;
    swapped: number;
    kvCache: number;
  }

  interface ServingGpu {
    index: string;
    name: string;
    usedMiB: number;
    totalMiB: number;
    utilPct: number;
  }

  interface ServingSnapshot {
    endpoints: ServingEndpoint[];
    gpus: ServingGpu[];
    fetchedAt: string;
  }

  // Live-Takt: API-Route fragt serverseitig die vLLM-/metrics an (kein CORS
  // im Browser), hier nur Anzeige plus Polling.
  let { intervalMs = 15000 }: { intervalMs?: number } = $props();
  let loading = $state(true);
  let error = $state('');
  let data = $state<ServingSnapshot | null>(null);

  function shortUrl(url: string): string {
    try {
      const u = new URL(url);
      return u.host;
    } catch {
      return url;
    }
  }

  function pct(v: number): string {
    return `${Math.round(v * 100)} %`;
  }

  async function load() {
    try {
      const res = await fetch('/sdlc/api/cockpit-serving', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`API ${res.status}`);
      data = await res.json();
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Fehler beim Laden';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    load();
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  });
</script>

<div class="serving" role="status" aria-label="GPU und Inference-Auslastung">
  {#if loading}
    <span class="serving-loading">Serving-Metriken laden …</span>
  {:else if error}
    <span class="serving-error">Serving-Metriken: {error}</span>
  {:else if data}
    {#each data.endpoints as ep}
      {#if ep.ok}
        <span class="chip">
          {shortUrl(ep.url)}{ep.model ? ` · ${ep.model}` : ''} · ▶ {ep.running} · ⏳ {ep.waiting} · KV {pct(ep.kvCache)}
        </span>
      {:else}
        <span class="chip chip-down">{shortUrl(ep.url)} · offline</span>
      {/if}
    {/each}
    {#each data.gpus as g}
      <span class="chip chip-gpu" title={g.name}>
        GPU{g.index} · {g.usedMiB}/{g.totalMiB} MiB · {g.utilPct} %
      </span>
    {/each}
  {/if}
</div>

<style>
  .serving { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--factory-border, #2a2a2a); font-family: var(--font-mono, monospace); font-size: 11px; }
  .chip { padding: 2px 8px; border-radius: 4px; background: oklch(0.72 0.12 145 / .15); color: oklch(0.80 0.12 145); }
  .chip-down { background: oklch(0.62 0.20 25 / .15); color: oklch(0.72 0.18 25); }
  .chip-gpu { background: oklch(0.70 0.10 250 / .15); color: oklch(0.78 0.10 250); }
  .serving-loading, .serving-error { font-size: 11px; opacity: .7; }
</style>
