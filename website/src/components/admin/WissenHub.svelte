<!-- website/src/components/admin/WissenHub.svelte -->
<script lang="ts">
  import BookUploadForm from './BookUploadForm.svelte';
  import KnowledgeJsonImport from './KnowledgeJsonImport.svelte';
  import WebCrawlSourceModal from './WebCrawlSourceModal.svelte';
  import KnowledgeSourceModal from './KnowledgeSourceModal.svelte';
  import CollectionMergePanel from './CollectionMergePanel.svelte';
  import DraftsInbox from './DraftsInbox.svelte';
  import type { Collection } from '../../lib/knowledge-db-types';
  import type { Book } from '../../lib/coaching-db';

  let {
    initialCollections = [],
    initialBooks = [],
    draftCount = 0,
  }: {
    initialCollections: Collection[];
    initialBooks: Book[];
    draftCount: number;
  } = $props();

  type Tab = 'einlesen' | 'sammlungen' | 'operationen' | 'entworfe';
  let activeTab = $state<Tab>('einlesen');

  let collections = $state<Collection[]>(initialCollections);
  let books = $state<Book[]>(initialBooks);

  function openJsonImport() {
    window.dispatchEvent(new CustomEvent('open-json-import-modal'));
  }
  function openWebCrawl() {
    window.dispatchEvent(new CustomEvent('open-web-crawl-modal'));
  }
  function openNewCollection() {
    window.dispatchEvent(new CustomEvent('open-wissensquellen-modal'));
  }
  function openMerge() {
    window.dispatchEvent(new CustomEvent('open-collection-merge'));
  }

  async function deleteBook(id: string) {
    if (!confirm('Buch und alle zugehörigen Chunks löschen?')) return;
    const r = await fetch(`/api/admin/coaching/books/${id}`, { method: 'DELETE' });
    if (r.ok) books = books.filter(b => b.id !== id);
    else alert('Fehler beim Löschen');
  }

  async function deleteCollectionById(id: string) {
    if (!confirm('Sammlung und alle Chunks löschen?')) return;
    const r = await fetch(`/api/admin/knowledge/collections/${id}`, { method: 'DELETE' });
    if (r.ok) collections = collections.filter(c => c.id !== id);
    else {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? 'Fehler beim Löschen');
    }
  }

  async function reindex(id: string, btn: HTMLButtonElement) {
    btn.disabled = true;
    btn.textContent = 'Läuft…';
    const r = await fetch(`/api/admin/knowledge/collections/${id}/reindex`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    btn.disabled = false;
    btn.textContent = 'Re-index';
    if (j.cmd) alert(`Bitte ausführen:\n${j.cmd}`);
    else if (!r.ok) alert(j.message ?? j.error ?? 'Fehler');
  }

  let crawlingIds = $state<Set<string>>(new Set());

  async function startCrawl(id: string, btn: HTMLButtonElement) {
    btn.disabled = true;
    btn.textContent = 'Starte…';
    const r = await fetch(`/api/admin/knowledge/collections/${id}/crawl`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      crawlingIds = new Set([...crawlingIds, id]);
      pollCrawl(id);
    } else {
      btn.disabled = false;
      btn.textContent = 'Crawl starten';
      alert(j.error ?? 'Fehler beim Starten des Crawls');
    }
  }

  function pollCrawl(id: string) {
    const interval = setInterval(async () => {
      const r = await fetch(`/api/admin/knowledge/collections/${id}/crawl`);
      if (!r.ok) { clearInterval(interval); crawlingIds = new Set([...crawlingIds].filter(x => x !== id)); return; }
      const j = await r.json();
      if (!j.running) {
        clearInterval(interval);
        crawlingIds = new Set([...crawlingIds].filter(x => x !== id));
        collections = collections.map(c => c.id === id ? { ...c } : c);
      }
    }, 2000);
  }
</script>

<div class="wissen-hub">
  <!-- Tab bar -->
  <div class="tab-bar">
    {#each ([
      { id: 'einlesen',    label: 'Einlesen' },
      { id: 'sammlungen',  label: 'Sammlungen' },
      { id: 'operationen', label: 'Operationen' },
      { id: 'entworfe',    label: 'Entwürfe', badge: draftCount > 0 ? draftCount : undefined },
    ] as const) as tab}
      <button
        class="tab-btn {activeTab === tab.id ? 'active' : ''}"
        onclick={() => activeTab = tab.id}
      >
        {tab.label}
        {#if tab.badge}
          <span class="badge">{tab.badge}</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Einlesen -->
  {#if activeTab === 'einlesen'}
    <div class="tab-content">
      <div class="ingest-grid">
        <div class="card">
          <div class="card-head book">📚 Buch hochladen</div>
          <p class="card-desc">PDF oder EPUB — wird chunked, embedded und als Coaching-Buch gespeichert.</p>
          <BookUploadForm />
        </div>

        <div class="card">
          <div class="card-head source">🔗 JSON / Web-Quelle</div>
          <p class="card-desc">Strukturiertes JSON importieren oder eine Website crawlen und als Wissenssammlung speichern.</p>
          <div class="btn-row">
            <button class="btn-secondary" onclick={openJsonImport}>JSON importieren</button>
            <button class="btn-secondary" onclick={openWebCrawl}>+ Web-Quelle</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Sammlungen -->
  {#if activeTab === 'sammlungen'}
    <div class="tab-content">
      <div class="table-actions">
        <button class="btn-secondary" onclick={openNewCollection}>+ Neue Sammlung</button>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th><th>Typ</th><th>Marke</th><th>Chunks</th><th>Letzter Index</th><th></th>
          </tr>
        </thead>
        <tbody>
          {#each books as book (book.id)}
            <tr>
              <td>{book.title}</td>
              <td><code>buch</code></td>
              <td>{book.slug ?? '—'}</td>
              <td>{book.chunkCount ?? '—'}</td>
              <td>—</td>
              <td class="actions">
                <button class="btn-danger" onclick={() => deleteBook(book.id)}>Löschen</button>
              </td>
            </tr>
          {/each}
          {#each collections as col (col.id)}
            <tr>
              <td>{col.name}</td>
              <td><code>{col.source}</code></td>
              <td>{col.brand ?? '—'}</td>
              <td>{col.chunk_count}</td>
              <td>{col.last_indexed_at ? new Date(col.last_indexed_at).toLocaleString('de-DE') : '—'}</td>
              <td class="actions">
                {#if col.source === 'web_crawl'}
                  {#if crawlingIds.has(col.id)}
                    <button class="btn-action" disabled>Crawl läuft…</button>
                  {:else}
                    <button class="btn-action" onclick={(e) => startCrawl(col.id, e.currentTarget as HTMLButtonElement)}>Crawl starten</button>
                  {/if}
                {/if}
                {#if col.source !== 'pr_history' && col.source !== 'specs_plans' && col.source !== 'claude_md' && col.source !== 'bug_tickets'}
                  <button class="btn-action" onclick={(e) => reindex(col.id, e.currentTarget as HTMLButtonElement)}>Re-index</button>
                  <button class="btn-danger" onclick={() => deleteCollectionById(col.id)}>Löschen</button>
                {:else}
                  <button class="btn-action" onclick={(e) => reindex(col.id, e.currentTarget as HTMLButtonElement)}>Re-index</button>
                {/if}
              </td>
            </tr>
          {/each}
          {#if books.length === 0 && collections.length === 0}
            <tr><td colspan="6" class="empty">Noch keine Quellen indexiert.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Operationen -->
  {#if activeTab === 'operationen'}
    <div class="tab-content">
      <div class="ops-section">
        <h3>Zusammenführen</h3>
        <p class="section-desc">Zwei oder mehr Sammlungen in eine neue Sammlung zusammenführen.</p>
        <button class="btn-primary" onclick={openMerge}>Merge-Dialog öffnen</button>
      </div>
    </div>
  {/if}

  <!-- Entwürfe -->
  {#if activeTab === 'entworfe'}
    <div class="tab-content">
      <DraftsInbox />
    </div>
  {/if}
</div>

<!-- Always-mounted modals (hidden until triggered) -->
<KnowledgeJsonImport onCreated={() => location.reload()} />
<WebCrawlSourceModal onCreated={() => location.reload()} />
<KnowledgeSourceModal onCreated={() => location.reload()} />
<CollectionMergePanel />

<style>
  .wissen-hub { padding: 1.5rem; max-width: 1100px; }

  .tab-bar {
    display: flex;
    gap: 4px;
    background: var(--admin-sidebar-bg, #1a1a2e);
    padding: 4px;
    border-radius: 14px;
    width: fit-content;
    margin-bottom: 1.5rem;
  }
  .tab-btn {
    padding: 6px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--admin-text-mute, #888);
    transition: all 0.15s;
    min-height: 36px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tab-btn.active {
    background: var(--admin-primary, #c9a84c);
    color: var(--admin-bg, #0f1117);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .tab-btn:not(.active):hover { color: #fff; }
  .badge {
    background: var(--admin-primary, #c9a84c);
    color: var(--admin-bg, #0f1117);
    font-size: 10px;
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }
  .tab-btn.active .badge {
    background: var(--admin-bg, #0f1117);
    color: var(--admin-primary, #c9a84c);
  }

  .tab-content { animation: fadeIn 0.15s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

  .ingest-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 768px) { .ingest-grid { grid-template-columns: 1fr; } }

  .card {
    background: var(--admin-card-bg, #1a1a2e);
    border: 1px solid var(--admin-border, #2a2a3e);
    border-radius: 12px;
    padding: 1.25rem;
  }
  .card-head {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 0.5rem;
  }
  .card-head.book { color: var(--admin-primary, #c9a84c); }
  .card-head.source { color: #6b9fff; }
  .card-desc { font-size: 12px; color: var(--admin-text-mute, #888); margin-bottom: 1rem; }

  .btn-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .btn-primary {
    background: var(--admin-primary, #c9a84c);
    color: var(--admin-bg, #0f1117);
    border: none;
    padding: 0.55rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 13px;
  }
  .btn-secondary {
    background: transparent;
    color: var(--admin-primary, #c9a84c);
    border: 1px solid var(--admin-primary, #c9a84c);
    padding: 0.45rem 0.9rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 13px;
  }
  .btn-action {
    background: transparent;
    color: var(--admin-text-mute, #888);
    border: 1px solid var(--admin-border, #3a3a5e);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn-action:hover { color: #fff; border-color: #aaa; }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-danger {
    background: transparent;
    color: #c96e6e;
    border: 1px solid #c96e6e;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .table-actions { margin-bottom: 0.75rem; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th, .data-table td {
    padding: 0.5rem 0.65rem;
    border-bottom: 1px solid var(--admin-border, #2a2a3e);
    text-align: left;
    color: var(--admin-fg, #e0e0e0);
  }
  .data-table th {
    color: var(--admin-text-mute, #888);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .actions { display: flex; gap: 0.4rem; white-space: nowrap; }
  .empty { color: var(--admin-text-mute, #888); font-style: italic; text-align: center; padding: 2rem; }
  code {
    font-family: monospace;
    font-size: 11px;
    background: var(--admin-bg, #0f1117);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
  }

  .ops-section { padding: 1.5rem; background: var(--admin-card-bg, #1a1a2e); border: 1px solid var(--admin-border, #2a2a3e); border-radius: 12px; max-width: 500px; }
  .ops-section h3 { font-size: 1rem; font-weight: 700; color: #fff; margin: 0 0 0.4rem; }
  .section-desc { font-size: 13px; color: var(--admin-text-mute, #888); margin-bottom: 1rem; }
</style>
