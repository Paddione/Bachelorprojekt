<script lang="ts">
  import { onMount } from 'svelte';
  let status: Record<string, unknown> | null = $state(null);
  onMount(async () => {
    const r = await fetch('/api/admin/tax-monitor/status');
    status = await r.json();
  });
  const pct = $derived(status ? Math.min(100, (status.revenue as number) / (status.thresholdKlein as number) * 100) : 0);
  const color = $derived(!status ? '#888'
    : status.status === 'exceeded' || status.status === 'hard' ? '#ef4444'
    : status.status === 'warning' ? '#f59e0b' : '#22c55e');
  const fmt = (n: number) => (n ?? 0).toFixed(2).replace('.', ',') + ' €';
</script>

{#if status}
<div class="tax-widget" style="border-color: {color}33;">
  <div class="tax-header">
    <span class="tax-label">Jahresumsatz {status.year as number}</span>
    <span class="tax-mode" style="color:{color}">
      {status.taxMode === 'kleinunternehmer' ? '§ 19 UStG' : 'Regelbesteuerung'}
    </span>
  </div>
  <div class="tax-amounts">
    <span class="tax-current" style="color:{color}">{fmt(status.revenue as number)}</span>
    <span class="tax-limit">von {fmt(status.thresholdKlein as number)}</span>
  </div>
  <div class="tax-bar-bg">
    <div class="tax-bar-fill" style="width:{pct}%; background:{color};"></div>
  </div>
  {#if status.status === 'warning'}
    <p class="tax-alert" style="color:#f59e0b;">⚠ Näherung an 25.000 €-Grenze (§ 19 UStG). Steuerberater informieren.</p>
  {:else if status.status === 'exceeded'}
    <p class="tax-alert" style="color:#ef4444;">🚨 25.000 €-Grenze überschritten — System auf Regelbesteuerung umgestellt.</p>
  {:else if status.status === 'hard'}
    <p class="tax-alert" style="color:#ef4444;">🚨 100.000 €-Grenze überschritten — Pflicht zur sofortigen Regelbesteuerung.</p>
  {/if}
</div>
{/if}

<style>
.tax-widget { border: 1px solid; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; background: rgba(255,255,255,0.02); }
.tax-header { display: flex; justify-content: space-between; margin-bottom: 0.25rem; }
.tax-label { font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--mute-2); }
.tax-mode { font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600; }
.tax-amounts { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.5rem; }
.tax-current { font-size: 1.5rem; font-weight: 700; font-family: var(--font-mono); }
.tax-limit { font-size: 0.75rem; color: var(--mute); }
.tax-bar-bg { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
.tax-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
.tax-alert { font-size: 0.75rem; margin-top: 0.5rem; }
</style>
