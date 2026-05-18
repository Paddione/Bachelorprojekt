<script lang="ts">
  import type { CoachingProject, ListProjectsResult } from '../../../lib/coaching-project-db';

  let { initialResult }: { initialResult: ListProjectsResult } = $props();

  let projects = $state<CoachingProject[]>(initialResult.projects);
  let total = $state(initialResult.total);
  let page = $state(initialResult.page);
  const pageSize = initialResult.pageSize;
  let q = $state('');
  let loading = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  async function load(p = page) {
    loading = true;
    const params = new URLSearchParams({ q, page: String(p), pageSize: String(pageSize) });
    const res = await fetch(`/api/admin/coaching/projects?${params}`);
    const data: ListProjectsResult = await res.json();
    projects = data.projects;
    total = data.total;
    page = data.page;
    loading = false;
  }

  function onSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => load(1), 300);
  }

  function fmtDate(d: Date | string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const totalPages = $derived(Math.ceil(total / pageSize));
</script>

<div class="overview">
  <div class="toolbar">
    <input
      class="search-input"
      type="text"
      placeholder="Kundennummer oder Bezeichnung suchen…"
      bind:value={q}
      oninput={onSearch}
    />
    <a href="/admin/coaching/sessions/new" class="btn-primary">+ Neue Session</a>
  </div>

  {#if loading}
    <div class="loading">Laden…</div>
  {:else if projects.length === 0}
    <div class="empty">Keine Projekte gefunden.</div>
  {:else}
    <table class="table">
      <thead>
        <tr>
          <th>Kundennummer</th>
          <th>Bezeichnung</th>
          <th>Sessions</th>
          <th>Letzter Kontakt</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each projects as p (p.id)}
          <tr>
            <td><span class="kunden-nr">{p.customerNumber}</span></td>
            <td>{p.displayAlias ?? '—'}</td>
            <td>{p.sessionCount ?? 0}</td>
            <td>{fmtDate(p.lastSessionAt)}</td>
            <td class="actions">
              <a href={`/admin/coaching/projekte/${p.id}`} class="btn-sm">Öffnen</a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if totalPages > 1}
      <div class="pagination">
        {#each Array.from({length: totalPages}, (_, i) => i + 1) as pg}
          <button class="page-btn {pg === page ? 'active' : ''}" onclick={() => load(pg)}>{pg}</button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .overview { max-width: 900px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .search-input { flex: 1; padding: 0.5rem 0.75rem; background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.9rem; outline: none; }
  .search-input:focus { border-color: var(--gold,#c9a55c); }
  .btn-primary { padding: 0.5rem 1.2rem; background: var(--gold,#c9a55c); color: #111; font-weight: 700; border-radius: 6px; text-decoration: none; font-size: 0.85rem; white-space: nowrap; }
  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line,#333); font-size: 0.82rem; color: var(--text-muted,#888); }
  .table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line,#222); font-size: 0.9rem; }
  .kunden-nr { font-family: monospace; color: var(--gold,#c9a55c); font-size: 0.88rem; }
  .actions { display: flex; gap: 0.4rem; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); text-decoration: none; background: none; cursor: pointer; }
  .pagination { display: flex; gap: 0.4rem; margin-top: 1rem; justify-content: center; }
  .page-btn { padding: 0.3rem 0.6rem; border: 1px solid var(--line,#444); border-radius: 4px; background: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.82rem; }
  .page-btn.active { border-color: var(--gold,#c9a55c); color: var(--gold,#c9a55c); }
  .loading, .empty { text-align: center; color: var(--text-muted,#888); padding: 2rem; }
</style>
