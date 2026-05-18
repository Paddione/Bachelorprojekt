<!-- website/src/components/admin/Components.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  interface ComponentRow {
    id: number; name: string;
    kind: 'physical' | 'non-physical'; area: string;
    status: 'active' | 'inactive' | 'deprecated';
    cluster: 'mentolder' | 'korczewski' | 'both';
    url: string | null; hostname: string | null; notes: string | null;
    created_at: string; updated_at: string;
  }

  const EMPTY: Omit<ComponentRow, 'id' | 'created_at' | 'updated_at'> = {
    name: '', kind: 'non-physical', area: '', status: 'active',
    cluster: 'both', url: null, hostname: null, notes: null,
  };

  let components: ComponentRow[] = [];
  let kindFilter = '';
  let clusterFilter = '';
  let statusFilter = 'active';
  let q = '';
  let loadError = '';
  let editing: (Partial<ComponentRow> & { _new?: boolean }) | null = null;

  const STATUS_BADGE = { active: '🟢', inactive: '🟡', deprecated: '🔴' } as const;
  const CLUSTER_BADGE = { mentolder: 'M', korczewski: 'K', both: 'M+K' } as const;

  async function load() {
    loadError = '';
    const sp = new URLSearchParams();
    if (kindFilter)    sp.set('kind', kindFilter);
    if (clusterFilter) sp.set('cluster', clusterFilter);
    if (statusFilter)  sp.set('status', statusFilter);
    if (q)             sp.set('q', q);
    try {
      const r = await fetch(`/api/admin/components?${sp}`);
      if (!r.ok) { loadError = `Fehler ${r.status}`; return; }
      components = (await r.json()).components ?? [];
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Fehler';
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout>;
  const debouncedLoad = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(load, 250); };

  onMount(load);

  const startNew  = () => { editing = { ...EMPTY, _new: true }; };
  const startEdit = (row: ComponentRow) => { editing = { ...row }; };
  const cancelEdit = () => { editing = null; };

  async function saveEdit() {
    if (!editing) return;
    const isNew = editing._new;
    const body = {
      name: editing.name, kind: editing.kind, area: editing.area,
      status: editing.status, cluster: editing.cluster,
      url: editing.url || null, hostname: editing.hostname || null,
      notes: editing.notes || null,
    };
    const r = await fetch(isNew ? '/api/admin/components' : `/api/admin/components/${editing.id}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) { alert(`Fehler ${r.status}`); return; }
    editing = null;
    await load();
  }

  async function deprecate(id: number) {
    if (!confirm('Als deprecated markieren?')) return;
    const r = await fetch(`/api/admin/components/${id}`, { method: 'DELETE' });
    if (!r.ok) { alert(`Fehler ${r.status}`); return; }
    await load();
  }

  function groupByArea(rows: ComponentRow[]): Record<string, ComponentRow[]> {
    return rows.reduce<Record<string, ComponentRow[]>>((acc, r) => {
      (acc[r.area] ??= []).push(r); return acc;
    }, {});
  }

  $: physical = components.filter(c => c.kind === 'physical');
  $: software = components.filter(c => c.kind === 'non-physical');
  $: physicalByArea = groupByArea(physical);
  $: softwareByArea = groupByArea(software);
</script>

{#if loadError}<p class="error">{loadError}</p>{/if}

<div class="toolbar">
  <div class="filters">
    <select bind:value={kindFilter} on:change={load}>
      <option value="">Alle Typen</option>
      <option value="physical">Physical</option>
      <option value="non-physical">Software</option>
    </select>
    <select bind:value={clusterFilter} on:change={load}>
      <option value="">Alle Cluster</option>
      <option value="mentolder">mentolder</option>
      <option value="korczewski">korczewski</option>
      <option value="both">both</option>
    </select>
    <select bind:value={statusFilter} on:change={load}>
      <option value="">Alle Status</option>
      <option value="active">active</option>
      <option value="inactive">inactive</option>
      <option value="deprecated">deprecated</option>
    </select>
    <input type="text" placeholder="Suche…" bind:value={q} on:input={debouncedLoad} />
  </div>
  <button class="btn-new" on:click={startNew}>+ Neue Komponente</button>
</div>

<div class="sections">
  {#if physical.length > 0}
    <section>
      <h2>Physisch</h2>
      <div class="area-grid">
        {#each Object.entries(physicalByArea) as [area, rows]}
          <article class="area-card">
            <h3>{area}</h3>
            <ul>
              {#each rows as c (c.id)}
                <li>
                  <span title={c.status}>{STATUS_BADGE[c.status]}</span>
                  <span class="name">{c.name}</span>
                  <span class="badge">{CLUSTER_BADGE[c.cluster]}</span>
                  {#if c.hostname}<small class="dim">{c.hostname}</small>{/if}
                  <button class="btn-sm" on:click={() => startEdit(c)}>edit</button>
                </li>
              {/each}
            </ul>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  {#if software.length > 0}
    <section>
      <h2>Software</h2>
      <div class="area-grid">
        {#each Object.entries(softwareByArea) as [area, rows]}
          <article class="area-card">
            <h3>{area}</h3>
            <ul>
              {#each rows as c (c.id)}
                <li>
                  <span title={c.status}>{STATUS_BADGE[c.status]}</span>
                  {#if c.url}
                    <a href={c.url} target="_blank" rel="noopener" class="name">{c.name}</a>
                  {:else}
                    <span class="name">{c.name}</span>
                  {/if}
                  <span class="badge">{CLUSTER_BADGE[c.cluster]}</span>
                  <button class="btn-sm" on:click={() => startEdit(c)}>edit</button>
                </li>
              {/each}
            </ul>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</div>

{#if editing}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" on:click|self={cancelEdit}>
    <form class="modal" on:submit|preventDefault={saveEdit}>
      <h3>{editing._new ? 'Neue Komponente' : `Bearbeiten: ${editing.name}`}</h3>
      <label>Name<input bind:value={editing.name} required /></label>
      <label>Typ
        <select bind:value={editing.kind}>
          <option value="non-physical">Software (non-physical)</option>
          <option value="physical">Hardware (physical)</option>
        </select>
      </label>
      <label>Area<input bind:value={editing.area} required placeholder="auth, infra, files, ai…" /></label>
      <label>Status
        <select bind:value={editing.status}>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="deprecated">deprecated</option>
        </select>
      </label>
      <label>Cluster
        <select bind:value={editing.cluster}>
          <option value="both">both</option>
          <option value="mentolder">mentolder</option>
          <option value="korczewski">korczewski</option>
        </select>
      </label>
      <label>URL<input type="url" bind:value={editing.url} placeholder="https://…" /></label>
      <label>Hostname / IP<input bind:value={editing.hostname} /></label>
      <label>Notizen<textarea bind:value={editing.notes} rows="3"></textarea></label>
      <footer>
        {#if !editing._new}
          <button type="button" class="btn-depr" on:click={() => { deprecate(editing!.id!); cancelEdit(); }}>als deprecated markieren</button>
        {/if}
        <button type="button" on:click={cancelEdit}>Abbrechen</button>
        <button type="submit">Speichern</button>
      </footer>
    </form>
  </div>
{/if}

<style>
  .toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:.5rem; }
  .filters { display:flex; gap:.5rem; flex-wrap:wrap; }
  .btn-new { padding:.4rem .85rem; background:var(--brass); color:var(--ink-900); border:none; border-radius:.375rem; cursor:pointer; font-weight:600; font-size:.875rem; }
  .sections { display:flex; flex-direction:column; gap:2rem; }
  h2 { font-size:.95rem; font-weight:600; margin-bottom:.75rem; color:var(--brass); }
  .area-grid { display:flex; flex-wrap:wrap; gap:.75rem; }
  .area-card { border:1px solid var(--line,#ccc); padding:.75rem 1rem; border-radius:.5rem; min-width:220px; }
  .area-card h3 { font-family:var(--font-mono); font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; color:var(--mute); margin-bottom:.5rem; }
  ul { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:.3rem; }
  li { display:flex; align-items:center; gap:.35rem; font-size:.85rem; }
  .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  a.name { color:var(--brass); text-decoration:none; }
  .badge { font-family:var(--font-mono); font-size:.7rem; color:var(--mute); flex-shrink:0; }
  .dim { font-size:.72rem; color:var(--mute); flex-shrink:0; }
  .btn-sm { font-size:.68rem; padding:.1rem .3rem; border:1px solid var(--line,#ccc); border-radius:.2rem; cursor:pointer; background:none; color:var(--mute); flex-shrink:0; }
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.45); display:grid; place-items:center; z-index:100; }
  .modal { background:var(--ink-850,white); padding:1.5rem; border-radius:.5rem; min-width:360px; max-width:460px; width:100%; display:grid; gap:.45rem; box-shadow:0 8px 32px rgba(0,0,0,.4); }
  .modal label { display:grid; gap:.2rem; font-size:.875rem; }
  .modal input, .modal select, .modal textarea { padding:.3rem .5rem; border:1px solid var(--line,#ccc); border-radius:.25rem; background:var(--ink-800,#fff); color:var(--fg); font-size:.875rem; }
  .modal footer { display:flex; justify-content:flex-end; gap:.5rem; margin-top:.4rem; }
  .btn-depr { margin-right:auto; background:none; border:1px solid #f87171; color:#f87171; border-radius:.25rem; padding:.25rem .5rem; cursor:pointer; font-size:.8rem; }
  .error { color:red; font-weight:bold; margin-bottom:1rem; }
</style>
