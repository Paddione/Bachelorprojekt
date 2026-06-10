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
  import { deriveSections, buildCommentBody, type ClarificationSection } from '../lib/clarification-questions';

  let expanded: Record<string, boolean> = {};
  let answers: Record<string, Record<string, any>> = {};
  let clarifying: Record<string, boolean> = {};

  function toggleExpand(extId: string) {
    expanded = { ...expanded, [extId]: !expanded[extId] };
  }

  function setAnswer(extId: string, key: string, value: any) {
    const cur = answers[extId] ?? {};
    answers = { ...answers, [extId]: { ...cur, [key]: value } };
  }

  function toggleCheckbox(extId: string, key: string, option: string) {
    const cur: string[] = (answers[extId]?.[key] as string[]) ?? [];
    const next = cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option];
    setAnswer(extId, key, next);
  }

  function isChecked(extId: string, key: string, option: string): boolean {
    return ((answers[extId]?.[key] as string[]) ?? []).includes(option);
  }

  async function saveClarification(it: any) {
    clarifying = { ...clarifying, [it.extId]: true };
    const itemAnswers: Record<string, any> = answers[it.extId] ?? {};
    const sections: ClarificationSection[] = deriveSections(it);

    const labels: Record<string, string> = {};
    for (const sec of sections) for (const f of sec.fields) labels[f.key] = f.label;

    const answered = (key: string) => {
      const v = itemAnswers[key];
      return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
    };
    const readinessUpdates: Record<string, boolean> = {};
    for (const sec of sections) {
      if (sec.fields.some((f) => answered(f.key))) readinessUpdates[sec.dorFlag] = true;
    }

    const depRaw = itemAnswers['abhaengigkeiten'];
    const dependsOn = typeof depRaw === 'string'
      ? depRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const effort = typeof itemAnswers['effort'] === 'string' ? itemAnswers['effort'] : undefined;

    const today = new Date().toISOString().slice(0, 10);
    const commentBody = buildCommentBody(itemAnswers, labels, today);

    await fetch(`/api/planning-office/${it.extId}/clarify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commentBody, readinessUpdates, dependsOn, effort }),
    });

    clarifying = { ...clarifying, [it.extId]: false };
    expanded = { ...expanded, [it.extId]: false };
    answers = { ...answers, [it.extId]: {} };
    await load();
  }

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
          <button class="po-expand" data-testid="office-expand"
                  on:click|stopPropagation={() => toggleExpand(it.extId)}
                  aria-expanded={expanded[it.extId] ?? false}
                  title="Klärungsfragen">
            {expanded[it.extId] ? '▲' : '▼'}
          </button>
        </div>
        {#if expanded[it.extId]}
          <div class="po-clarify" data-testid="office-clarify-{it.extId}">
            {#if it.valueProp}<p class="po-clarify-value">📎 {it.valueProp}</p>{/if}
            {#each deriveSections(it) as section}
              <fieldset class="po-clarify-section">
                <legend>🔴 {section.title}</legend>
                {#each section.fields as field}
                  <div class="po-field">
                    <label class="po-field-label">{field.label}</label>
                    {#if field.type === 'text'}
                      {#if field.multiline}
                        <textarea data-testid="clarify-{field.key}"
                          value={answers[it.extId]?.[field.key] ?? ''}
                          on:input={(e:any) => setAnswer(it.extId, field.key, e.target.value)}></textarea>
                      {:else}
                        <input type="text" data-testid="clarify-{field.key}"
                          value={answers[it.extId]?.[field.key] ?? ''}
                          on:input={(e:any) => setAnswer(it.extId, field.key, e.target.value)} />
                      {/if}
                    {:else if field.type === 'radio'}
                      <div class="po-options">
                        {#each field.options ?? [] as opt}
                          <label class="po-opt">
                            <input type="radio" name="{it.extId}-{field.key}"
                              data-testid="clarify-{field.key}-{opt}"
                              checked={answers[it.extId]?.[field.key] === opt}
                              on:change={() => setAnswer(it.extId, field.key, opt)} />
                            {opt}
                          </label>
                        {/each}
                      </div>
                    {:else if field.type === 'checkboxes'}
                      <div class="po-options">
                        {#each field.options ?? [] as opt}
                          <label class="po-opt">
                            <input type="checkbox"
                              data-testid="clarify-{field.key}-{opt}"
                              checked={isChecked(it.extId, field.key, opt)}
                              on:change={() => toggleCheckbox(it.extId, field.key, opt)} />
                            {opt}
                          </label>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </fieldset>
            {/each}
            <button class="po-clarify-save" data-testid="office-clarify-save"
                    on:click|stopPropagation={() => saveClarification(it)}
                    disabled={clarifying[it.extId]}>
              {clarifying[it.extId] ? 'Speichern…' : '✓ Antworten speichern'}
            </button>
          </div>
        {/if}
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
  .po-expand { background:none; border:none; color:#888; cursor:pointer; font-size:.9rem; }
  .po-clarify { border:1px solid #333; border-top:none; border-radius:0 0 .4rem .4rem;
                padding:.6rem .75rem; margin:-.4rem 0 .6rem 0; background:#1b1b22; }
  .po-clarify-value { color:#aaa; font-size:.8rem; margin:0 0 .5rem; }
  .po-clarify-section { border:1px solid #2a2a33; border-radius:.4rem; margin:0 0 .6rem; padding:.4rem .6rem; }
  .po-clarify-section legend { font-size:.8rem; color:#e0653f; }
  .po-field { margin:.4rem 0; }
  .po-field-label { display:block; font-size:.78rem; color:#ccc; margin-bottom:.2rem; }
  .po-field input[type="text"], .po-field textarea { width:100%; box-sizing:border-box;
    background:#111; border:1px solid #333; color:#eee; border-radius:.3rem; padding:.3rem; }
  .po-field textarea { min-height:3rem; resize:vertical; }
  .po-options { display:flex; flex-wrap:wrap; gap:.5rem; }
  .po-opt { font-size:.78rem; display:flex; align-items:center; gap:.2rem; }
  .po-clarify-save { margin-top:.3rem; }
  .muted { color:#888; }
</style>
