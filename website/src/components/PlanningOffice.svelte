<script lang="ts">
  import { onMount } from 'svelte';
  const DOR_KEYS = ['spec_skizziert','offene_fragen_geklaert','abhaengigkeiten_klar','aufwand_geschaetzt'];
  const DOR_LABEL: Record<string,string> = {
    spec_skizziert: 'Spec skizziert', offene_fragen_geklaert: 'Fragen geklärt',
    abhaengigkeiten_klar: 'Abhängigkeiten klar', aufwand_geschaetzt: 'Aufwand geschätzt',
  };
  export let brand: string = 'mentolder';
  let items: any[] = []; let selected: any = null; let loading = true; let override = false;
  let newTitle = ''; let newEffort = 'mittel';

  const dor = (r: any) => DOR_KEYS.reduce((n,k)=> n + (r?.[k]===true?1:0), 0);

  async function load() {
    loading = true;
    const r = await fetch('/api/planning-office');
    items = r.ok ? (await r.json()).items : [];
    if (selected) selected = items.find(i => i.extId === selected.extId) ?? null;
    loading = false;
  }
  async function patch(extId: string, body: any) {
    await fetch(`/api/planning-office/${extId}`, {
      method: 'PATCH', headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
    await load();
  }
  async function toggleDor(it: any, key: string) {
    await patch(it.extId, { readiness: { ...it.readiness, [key]: !(it.readiness?.[key]) } });
  }
  async function move(it: any, dir: number) {
    await patch(it.extId, { rank: (it.rank ?? 0) + dir });
  }
  async function promote(it: any) {
    const r = await fetch(`/api/planning-office/${it.extId}/promote`, {
      method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ override }) });
    if (!r.ok) alert('Promote abgelehnt: ' + (await r.json()).error);
    await load();
  }
  async function addIdea() {
    if (!newTitle.trim()) return;
    await fetch('/api/planning-office', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ title: newTitle, brand, effort: newEffort }) });
    newTitle = ''; await load();
  }
  onMount(load);
</script>

<div class="po" data-testid="office-root">
  <div class="po-list" data-testid="office-list">
    <form class="po-add" data-testid="office-add-form" on:submit|preventDefault={addIdea}>
      <input data-testid="office-add-title" placeholder="Neue Idee…" bind:value={newTitle} />
      <select data-testid="office-add-effort" bind:value={newEffort}>
        <option value="klein">klein</option><option value="mittel">mittel</option><option value="gross">groß</option>
      </select>
      <button type="submit">+ Anlegen</button>
    </form>
    {#if loading}<p>Lädt…</p>
    {:else if !items.length}<p class="muted">Büro leer.</p>
    {:else}
      {#each items as it (it.extId)}
        <div class="po-card" data-testid="office-card" class:next={it.rank===0 && dor(it.readiness)===4}
             on:click={() => selected = it}>
          <div class="po-rank">
            <button data-testid="office-rank-up" on:click|stopPropagation={() => move(it,-1)}>▲</button>
            <button data-testid="office-rank-down" on:click|stopPropagation={() => move(it,1)}>▼</button>
          </div>
          <div class="po-body">
            <strong>{it.title}</strong>
            <span class="po-badge">{it.effort ?? '—'}</span>
            {#each it.areas as a}<span class="po-chip">{a}</span>{/each}
            {#if it.rank===0 && dor(it.readiness)===4}<span class="po-next">📌 Nächster</span>{/if}
          </div>
          <div class="po-dor" data-testid="office-dor">{dor(it.readiness)}/4</div>
        </div>
      {/each}
    {/if}
  </div>

  {#if selected}
    <div class="po-editor" data-testid="office-editor">
      <h3>{selected.title}</h3>
      <label>Kern-Nutzen
        <input data-testid="office-edit-valueprop" value={selected.valueProp ?? ''}
               on:change={(e:any) => patch(selected.extId, { valueProp: e.target.value })} />
      </label>
      <fieldset>
        <legend>Definition of Ready</legend>
        {#each DOR_KEYS as k}
          <label class="po-check">
            <input type="checkbox" data-testid={`office-dor-${k}`}
                   checked={selected.readiness?.[k]===true} on:change={() => toggleDor(selected, k)} />
            {DOR_LABEL[k]}
          </label>
        {/each}
      </fieldset>
      <label class="po-check">
        <input type="checkbox" data-testid="office-override" bind:checked={override} /> Override (trotz &lt; 4/4)
      </label>
      <button data-testid="office-promote" disabled={!override && dor(selected.readiness) < 4}
              on:click={() => promote(selected)}>Als nächstes planen</button>
    </div>
  {/if}
</div>

<style>
  .po { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
  .po-card { display:flex; gap:.5rem; align-items:center; padding:.5rem; border:1px solid #333;
             border-radius:.4rem; cursor:pointer; margin-bottom:.4rem; }
  .po-card.next { border-color:#d4af37; }
  .po-badge { font-size:.7rem; background:#33333f; border-radius:.3rem; padding:.1rem .3rem; }
  .po-chip { font-size:.7rem; background:#222; border-radius:.3rem; padding:.1rem .3rem; margin-left:.2rem; }
  .po-next { color:#d4af37; font-size:.75rem; margin-left:.4rem; }
  .po-dor { color:#5fd35f; font-weight:600; }
  .po-rank button { display:block; background:none; border:none; color:#888; cursor:pointer; }
  .po-editor { border:1px solid #333; border-radius:.4rem; padding:.75rem; }
  .po-check { display:block; }
  .muted { color:#888; }
</style>
