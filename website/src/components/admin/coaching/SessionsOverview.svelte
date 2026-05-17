<script lang="ts">
  import type { Session, ListSessionsResult } from '../../../lib/coaching-session-db';

  let {
    initialResult,
  }: { initialResult: ListSessionsResult } = $props();

  let sessions = $state<Session[]>(initialResult.sessions);
  let total = $state(initialResult.total);
  let page = $state(initialResult.page);
  const pageSize = initialResult.pageSize;

  let q = $state('');
  let sort = $state<string>('created_at');
  let order = $state<'asc' | 'desc'>('desc');
  let statusFilter = $state<string[]>([]);
  let showArchived = $state(false);
  let loading = $state(false);

  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  const STATUS_OPTIONS = [
    { value: 'active',    label: 'Läuft',         cls: 'badge-active' },
    { value: 'paused',    label: 'Pause',          cls: 'badge-paused' },
    { value: 'completed', label: 'Abgeschlossen',  cls: 'badge-completed' },
    { value: 'abandoned', label: 'Abgebrochen',    cls: 'badge-abandoned' },
  ];

  function badgeCls(status: string) {
    return STATUS_OPTIONS.find(s => s.value === status)?.cls ?? 'badge-abandoned';
  }
  function statusLabel(status: string) {
    return STATUS_OPTIONS.find(s => s.value === status)?.label ?? status;
  }

  async function load(p = page) {
    loading = true;
    const params = new URLSearchParams({
      q, sort, order, page: String(p), pageSize: String(pageSize),
      archived: String(showArchived),
    });
    statusFilter.forEach(s => params.append('status', s));
    const res = await fetch(`/api/admin/coaching/sessions?${params}`);
    const data: ListSessionsResult = await res.json();
    sessions = data.sessions;
    total = data.total;
    page = data.page;
    loading = false;
  }

  function onSearch() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => load(1), 300);
  }

  function toggleSort(col: string) {
    if (sort === col) {
      order = order === 'asc' ? 'desc' : 'asc';
    } else {
      sort = col;
      order = 'asc';
    }
    load(1);
  }

  function toggleStatus(val: string) {
    if (statusFilter.includes(val)) {
      statusFilter = statusFilter.filter(s => s !== val);
    } else {
      statusFilter = [...statusFilter, val];
    }
    load(1);
  }

  async function changeStatus(id: string, newStatus: string) {
    await fetch(`/api/admin/coaching/sessions/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await load();
  }

  let confirmArchiveId = $state<string | null>(null);

  async function doArchive(id: string) {
    await fetch(`/api/admin/coaching/sessions/${id}/archive`, { method: 'POST' });
    confirmArchiveId = null;
    await load();
  }

  async function doUnarchive(id: string) {
    await fetch(`/api/admin/coaching/sessions/${id}/unarchive`, { method: 'POST' });
    await load();
  }

  let confirmDeleteId = $state<string | null>(null);

  async function doDelete(id: string) {
    const res = await fetch(`/api/admin/coaching/sessions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      sessions = sessions.filter(s => s.id !== id);
      total = total - 1;
    } else {
      alert('Fehler beim Löschen');
    }
    confirmDeleteId = null;
  }

  function fmtDate(d: Date | string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const totalPages = $derived(Math.ceil(total / pageSize));
</script>

<div class="overview">
  <!-- Toolbar -->
  <div class="toolbar">
    <input
      class="search-input"
      type="text"
      placeholder="Titel oder Klient suchen…"
      bind:value={q}
      oninput={onSearch}
    />
    <a href="/admin/coaching/sessions/new" class="btn-primary">+ Neue Session</a>
    <a href="/admin/coaching/settings" class="btn-sm">⚙ Einstellungen</a>
  </div>

  <!-- Status-Filter -->
  <div class="filter-row">
    {#each STATUS_OPTIONS as opt}
      <button
        class="filter-btn {statusFilter.includes(opt.value) ? 'active' : ''}"
        onclick={() => toggleStatus(opt.value)}
      >{opt.label}</button>
    {/each}
    <label class="archive-toggle">
      <input type="checkbox" bind:checked={showArchived} onchange={() => load(1)} />
      Archivierte anzeigen
    </label>
  </div>

  <!-- Tabelle -->
  {#if loading}
    <div class="loading">Laden…</div>
  {:else if sessions.length === 0}
    <div class="empty">Keine Sessions gefunden.</div>
  {:else}
    <table class="table">
      <thead>
        <tr>
          <th><button class="sort-btn" onclick={() => toggleSort('title')}>Titel {sort==='title' ? (order==='asc'?'↑':'↓') : ''}</button></th>
          <th><button class="sort-btn" onclick={() => toggleSort('client_name')}>Klient {sort==='client_name' ? (order==='asc'?'↑':'↓') : ''}</button></th>
          <th><button class="sort-btn" onclick={() => toggleSort('created_at')}>Datum {sort==='created_at' ? (order==='asc'?'↑':'↓') : ''}</button></th>
          <th><button class="sort-btn" onclick={() => toggleSort('status')}>Status {sort==='status' ? (order==='asc'?'↑':'↓') : ''}</button></th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each sessions as s (s.id)}
          <tr class={s.archivedAt ? 'archived-row' : ''}>
            <td><a href={`/admin/coaching/sessions/${s.id}`}>{s.title}</a></td>
            <td>{s.clientName ?? s.clientId ?? '—'}</td>
            <td>{fmtDate(s.createdAt)}</td>
            <td>
              {#if !s.archivedAt}
                <select
                  class="status-select {badgeCls(s.status)}"
                  value={s.status}
                  onchange={(e) => changeStatus(s.id, (e.target as HTMLSelectElement).value)}
                >
                  {#each STATUS_OPTIONS as opt}
                    <option value={opt.value} disabled={s.status === 'completed' && opt.value === 'active'}>
                      {opt.label}
                    </option>
                  {/each}
                </select>
              {:else}
                <span class="badge badge-abandoned">Archiviert</span>
              {/if}
            </td>
            <td class="actions">
              <a href={`/admin/coaching/sessions/${s.id}`} class="btn-sm">Öffnen</a>
              {#if s.archivedAt}
                <button class="btn-sm" onclick={() => doUnarchive(s.id)} title="Archivierung aufheben">↩</button>
              {:else if confirmArchiveId === s.id}
                <button class="btn-sm btn-danger" onclick={() => doArchive(s.id)}>Sicher?</button>
                <button class="btn-sm" onclick={() => confirmArchiveId = null}>Abbruch</button>
              {:else}
                <button class="btn-sm" onclick={() => confirmArchiveId = s.id} title="Archivieren">📦</button>
              {/if}
              {#if confirmDeleteId === s.id}
                <button class="btn-sm btn-danger" onclick={() => doDelete(s.id)}>Sicher?</button>
                <button class="btn-sm" onclick={() => confirmDeleteId = null}>Abbruch</button>
              {:else}
                <button class="btn-sm btn-danger" onclick={() => confirmDeleteId = s.id} title="Löschen">×</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <!-- Paginierung -->
    {#if totalPages > 1}
      <div class="pagination">
        {#each Array.from({length: totalPages}, (_, i) => i + 1) as p}
          <button class="page-btn {p === page ? 'active' : ''}" onclick={() => load(p)}>{p}</button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .overview { max-width: 1000px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
  .toolbar { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .search-input { flex: 1; padding: 0.5rem 0.75rem; background: var(--bg-2,#1a1a1a); border: 1px solid var(--line,#333); border-radius: 6px; color: var(--text-light,#f0f0f0); font-size: 0.9rem; outline: none; }
  .search-input:focus { border-color: var(--gold,#c9a55c); }
  .btn-primary { padding: 0.5rem 1.2rem; background: var(--gold,#c9a55c); color: #111; font-weight: 700; border-radius: 6px; text-decoration: none; font-size: 0.85rem; white-space: nowrap; }
  .filter-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
  .filter-btn { padding: 0.3rem 0.75rem; border: 1px solid var(--line,#444); border-radius: 20px; background: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.8rem; }
  .filter-btn.active { border-color: var(--gold,#c9a55c); color: var(--gold,#c9a55c); }
  .archive-toggle { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--text-muted,#888); cursor: pointer; margin-left: auto; }
  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line,#333); font-size: 0.82rem; color: var(--text-muted,#888); }
  .table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line,#222); font-size: 0.9rem; }
  .table a { color: var(--gold,#c9a55c); text-decoration: none; }
  .sort-btn { background: none; border: none; color: inherit; cursor: pointer; font-size: inherit; padding: 0; }
  .status-select { border: 1px solid var(--line,#444); border-radius: 4px; background: var(--bg-2,#1a1a1a); color: var(--text-light,#f0f0f0); font-size: 0.8rem; padding: 0.2rem 0.4rem; cursor: pointer; }
  .badge { font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; }
  .badge-active, .status-select.badge-active { color: #60a5fa; }
  .badge-paused, .status-select.badge-paused { color: #f59e0b; }
  .badge-completed, .status-select.badge-completed { color: #4ade80; }
  .badge-abandoned, .status-select.badge-abandoned { color: #94a3b8; }
  .archived-row { opacity: 0.5; }
  .actions { display: flex; gap: 0.4rem; align-items: center; }
  .btn-sm { padding: 0.3rem 0.7rem; border: 1px solid var(--line,#444); border-radius: 4px; font-size: 0.82rem; color: var(--text-muted,#888); text-decoration: none; background: none; cursor: pointer; }
  .btn-danger { border-color: #ef4444; color: #ef4444; }
  .pagination { display: flex; gap: 0.4rem; margin-top: 1rem; justify-content: center; }
  .page-btn { padding: 0.3rem 0.6rem; border: 1px solid var(--line,#444); border-radius: 4px; background: none; color: var(--text-muted,#888); cursor: pointer; font-size: 0.82rem; }
  .page-btn.active { border-color: var(--gold,#c9a55c); color: var(--gold,#c9a55c); }
  .loading, .empty { text-align: center; color: var(--text-muted,#888); padding: 2rem; }
</style>
