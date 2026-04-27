<script lang="ts">
  import { onMount } from 'svelte';
  let { year = new Date().getFullYear() }: { year?: number } = $props();
  let data: Record<string, number> | null = $state(null);
  onMount(async () => {
    const r = await fetch(`/api/admin/bookkeeping/summary?year=${year}`);
    data = await r.json();
  });
  const fmt = (n: number) => (n ?? 0).toFixed(2).replace('.', ',') + ' €';
</script>

{#if data}
<div class="eur-card">
  <h3 class="eur-title">EÜR {data.year}</h3>
  <div class="eur-grid">
    <div class="eur-row"><span>Betriebseinnahmen</span><strong>{fmt(data.totalIncome)}</strong></div>
    <div class="eur-row"><span>Betriebsausgaben</span><strong>{fmt(data.totalExpenses)}</strong></div>
    <div class="eur-row eur-total"><span>Gewinn / Verlust</span><strong style="color:{data.profit>=0?'#22c55e':'#ef4444'}">{fmt(data.profit)}</strong></div>
    <div class="eur-row"><span>Vereinnahmte USt</span><span>{fmt(data.totalVatCollected)}</span></div>
    <div class="eur-row"><span>Gezahlte Vorsteuer</span><span>{fmt(data.totalPretax)}</span></div>
  </div>
</div>
{/if}

<style>
.eur-card { background:rgba(255,255,255,0.03); border:1px solid var(--line); border-radius:8px; padding:1.25rem; }
.eur-title { font-family:var(--font-serif); font-size:1rem; color:var(--fg); margin-bottom:0.75rem; }
.eur-grid { display:flex; flex-direction:column; gap:0.375rem; }
.eur-row { display:flex; justify-content:space-between; font-size:0.875rem; color:var(--mute); }
.eur-row strong { color:var(--fg); }
.eur-total { border-top:1px solid var(--line); padding-top:0.375rem; margin-top:0.25rem; font-weight:600; }
</style>
