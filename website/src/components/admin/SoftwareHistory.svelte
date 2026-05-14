<script lang="ts">
  import { onMount } from 'svelte';

  interface StackRow { service: string; area: string; as_of: string; last_pr: number; }
  interface HistoryRow {
    id: number; pr_number: number; merged_at: string; title: string;
    brand: string | null; merged_by: string | null;
    service: string; area: string;
    kind: 'added'|'removed'|'changed'|'irrelevant';
    confidence: number; classifier: string; classified_at: string; notes: string | null;
  }

  let stack: StackRow[] = [];
  let events: HistoryRow[] = [];
  let kindFilter = '';
  let areaFilter = '';
  let q = '';
  let editing: HistoryRow | null = null;

  const KIND_BADGE: Record<HistoryRow['kind'], string> = {
    added: '➕', removed: '➖', changed: '✏️', irrelevant: '⊘',
  };

  async function load() {
    const sp = new URLSearchParams();
    if (kindFilter) sp.set('kind', kindFilter);
    if (areaFilter) sp.set('area', areaFilter);
    if (q)          sp.set('q', q);
    const r = await fetch(`/api/admin/software-history?${sp.toString()}`);
    const j = await r.json();
    stack = j.stack; events = j.events;
  }

  onMount(load);

  function startEdit(row: HistoryRow) { editing = { ...row }; }
  function cancelEdit() { editing = null; }

  async function saveEdit() {
    if (!editing) return;
    const r = await fetch(`/api/admin/software-history/${editing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service: editing.service, area: editing.area,
        kind: editing.kind, notes: editing.notes,
      }),
    });
    if (!r.ok) { alert(`save failed: ${r.status}`); return; }
    editing = null;
    await load();
  }

  // Group stack by area for the top section.
  $: stackByArea = stack.reduce<Record<string, StackRow[]>>((acc, r) => {
    (acc[r.area] ??= []).push(r); return acc;
  }, {});
</script>

<section class="stack">
  <h2>Heutiger Stack</h2>
  {#each Object.entries(stackByArea) as [area, rows]}
    <article class="area-card">
      <h3>{area}</h3>
      <ul>
        {#each rows as r}
          <li>
            <a href="#event-{r.last_pr}"><code>{r.service}</code></a>
            <small>seit {new Date(r.as_of).toLocaleDateString()}</small>
          </li>
        {/each}
      </ul>
    </article>
  {/each}
</section>

<section class="filters">
  <input type="text" placeholder="Volltext…" bind:value={q} on:input={load} />
  <select bind:value={kindFilter} on:change={load}>
    <option value="">alle Kinds</option>
    <option value="added">added</option>
    <option value="removed">removed</option>
    <option value="changed">changed</option>
  </select>
  <select bind:value={areaFilter} on:change={load}>
    <option value="">alle Areas</option>
    {#each Array.from(new Set(events.map((e) => e.area))).sort() as a}
      <option value={a}>{a}</option>
    {/each}
  </select>
</section>

<section class="history">
  <table>
    <thead>
      <tr><th>Datum</th><th>Kind</th><th>Service</th><th>Area</th><th>PR</th><th>Confidence</th><th>Quelle</th><th>Notes</th><th></th></tr>
    </thead>
    <tbody>
      {#each events as e}
        <tr id="event-{e.pr_number}">
          <td>{new Date(e.merged_at).toLocaleDateString()}</td>
          <td title={e.kind}>{KIND_BADGE[e.kind]} {e.kind}</td>
          <td><code>{e.service}</code></td>
          <td>{e.area}</td>
          <td><a href="https://github.com/Paddione/Bachelorprojekt/pull/{e.pr_number}" target="_blank" rel="noopener">#{e.pr_number}</a> — {e.title}</td>
          <td>{(e.confidence * 100).toFixed(0)}%</td>
          <td><small>{e.classifier}</small></td>
          <td><small>{e.notes ?? ''}</small></td>
          <td><button on:click={() => startEdit(e)}>edit</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

{#if editing}
  <div class="modal-backdrop" on:click|self={cancelEdit}>
    <form class="modal" on:submit|preventDefault={saveEdit}>
      <h3>PR #{editing.pr_number} — {editing.title}</h3>
      <label>Service <input bind:value={editing.service} /></label>
      <label>Area <input bind:value={editing.area} /></label>
      <label>Kind
        <select bind:value={editing.kind}>
          <option value="added">added</option>
          <option value="removed">removed</option>
          <option value="changed">changed</option>
          <option value="irrelevant">irrelevant</option>
        </select>
      </label>
      <label>Notes <textarea bind:value={editing.notes}></textarea></label>
      <footer>
        <button type="button" on:click={cancelEdit}>cancel</button>
        <button type="submit">save</button>
      </footer>
    </form>
  </div>
{/if}

<style>
  .stack { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 2rem; }
  .area-card { border: 1px solid #ccc; padding: .75rem 1rem; border-radius: .5rem; min-width: 240px; }
  .filters { display: flex; gap: .5rem; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th, td { border-bottom: 1px solid #eee; padding: .4rem .5rem; text-align: left; vertical-align: top; }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: grid; place-items: center; z-index: 100; }
  .modal { background: white; padding: 1.5rem; border-radius: .5rem; min-width: 400px; display: grid; gap: .5rem; }
  .modal label { display: grid; gap: .25rem; }
  .modal footer { display: flex; justify-content: end; gap: .5rem; margin-top: 1rem; }
</style>
