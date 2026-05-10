<!-- website/src/components/admin/DraftsInbox.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  type Kind = 'reflection' | 'dialog_pattern' | 'exercise' | 'case_example';
  type Status = 'open' | 'accepted' | 'rejected' | 'skipped';
  interface Draft {
    id: string;
    book_id: string;
    template_kind: Kind;
    suggested_payload: Record<string, unknown>;
    status: Status;
    created_at: string;
  }
  interface Book { id: string; title: string; author: string | null }
  interface Detail extends Draft { chunkText: string; page: number | null }

  let books: Book[] = [];
  let drafts: Draft[] = [];
  let selectedBook: string | null = null;
  let selectedKinds: Set<Kind> = new Set(['reflection', 'dialog_pattern', 'exercise', 'case_example']);
  let selectedStatus: Status = 'open';
  let detail: Detail | null = null;
  let editPayload: string = '';
  let acceptanceRate: { acceptanceRate: number | null; accepted: number; rejected: number; skipped: number; total: number } | null = null;
  let working = false;
  let toast: string | null = null;

  const KIND_LABEL: Record<Kind, string> = {
    reflection: 'Reflexion',
    dialog_pattern: 'Dialog-Muster',
    exercise: 'Übung',
    case_example: 'Fallbeispiel',
  };

  onMount(async () => {
    const r = await fetch('/api/admin/coaching/books').then((x) => x.json());
    books = r.books ?? [];
    if (books.length > 0) selectedBook = books[0].id;
    await refresh();
  });

  async function refresh() {
    const params = new URLSearchParams();
    if (selectedBook) params.set('book_id', selectedBook);
    params.set('status', selectedStatus);
    const r = await fetch(`/api/admin/coaching/drafts?${params}`).then((x) => x.json());
    drafts = (r.drafts as Draft[]).filter((d) => selectedKinds.has(d.template_kind));
    if (selectedBook) {
      acceptanceRate = await fetch(`/api/admin/coaching/books/${selectedBook}/acceptance-rate`).then((x) => x.json());
    }
  }

  async function open(id: string) {
    detail = await fetch(`/api/admin/coaching/drafts/${id}`).then((x) => x.json());
    editPayload = JSON.stringify(detail!.suggested_payload, null, 2);
  }

  async function accept(then?: 'publish') {
    if (!detail) return;
    working = true;
    try {
      const body = { payload_overrides: JSON.parse(editPayload) };
      const url = `/api/admin/coaching/drafts/${detail.id}/accept${then ? '?then=publish' : ''}`;
      const r = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Accept fehlgeschlagen');
      toast = `Snippet erstellt (id=${j.snippet_id})`;
      detail = null;
      await refresh();
      if (j.redirect_to) window.location.href = j.redirect_to;
    } catch (err) { toast = err instanceof Error ? err.message : String(err); }
    finally { working = false; }
  }

  async function reject() {
    if (!detail) return;
    const reason = window.prompt('Ablehnungsgrund (optional):') ?? '';
    working = true;
    try {
      const r = await fetch(`/api/admin/coaching/drafts/${detail.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
        headers: { 'content-type': 'application/json' },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Reject fehlgeschlagen');
      toast = 'Draft abgelehnt';
      detail = null;
      await refresh();
    } catch (err) { toast = err instanceof Error ? err.message : String(err); }
    finally { working = false; }
  }

  function toggleKind(k: Kind) {
    if (selectedKinds.has(k)) selectedKinds.delete(k); else selectedKinds.add(k);
    selectedKinds = selectedKinds;
    refresh();
  }

  $: groupedByKind = drafts.reduce((acc, d) => {
    (acc[d.template_kind] ||= []).push(d);
    return acc;
  }, {} as Record<Kind, Draft[]>);

  $: rateBadge = acceptanceRate?.acceptanceRate;
  $: rateClass = rateBadge === null ? 'badge--muted' : rateBadge < 0.3 ? 'badge--warn' : 'badge--ok';
</script>

<div class="inbox">
  <aside class="rail">
    <h3>Buch</h3>
    <select bind:value={selectedBook} on:change={refresh}>
      {#each books as b}<option value={b.id}>{b.title}</option>{/each}
    </select>

    {#if acceptanceRate}
      <div class="rate {rateClass}">
        <strong>{rateBadge === null ? '—' : Math.round(rateBadge * 100) + '%'}</strong>
        <small>Accept-Rate · {acceptanceRate.accepted}✓ {acceptanceRate.rejected}✗ {acceptanceRate.skipped}↻</small>
        {#if rateBadge !== null && rateBadge < 0.3}
          <p class="warn">Klassifikator versagt — lieber manuell im Themen-Browser arbeiten.</p>
        {/if}
      </div>
    {/if}

    <h3>Art</h3>
    {#each Object.keys(KIND_LABEL) as k}
      <label class="chip">
        <input type="checkbox" checked={selectedKinds.has(k as Kind)} on:change={() => toggleKind(k as Kind)} />
        {KIND_LABEL[k as Kind]}
      </label>
    {/each}

    <h3>Status</h3>
    <select bind:value={selectedStatus} on:change={refresh}>
      <option value="open">Offen</option>
      <option value="accepted">Akzeptiert</option>
      <option value="rejected">Abgelehnt</option>
      <option value="skipped">Übersprungen</option>
    </select>
  </aside>

  <section class="list">
    {#if drafts.length === 0}
      <p class="empty">Noch keine Drafts. Lauf <code>task coaching:classify -- --slug=&lt;slug&gt;</code> nach dem ersten Buch-Ingest.</p>
    {:else}
      {#each Object.entries(groupedByKind) as [kind, list]}
        <h2>{KIND_LABEL[kind as Kind]} <span class="count">{list.length}</span></h2>
        <ul>
          {#each list as d}
            <li class:active={detail?.id === d.id}>
              <button on:click={() => open(d.id)}>
                {(d.suggested_payload as any)?.title ?? '(ohne Titel)'}
              </button>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
  </section>

  <article class="detail">
    {#if !detail}
      <p class="empty">Wähle einen Draft aus der Liste.</p>
    {:else}
      <header>
        <span class="kind">{KIND_LABEL[detail.template_kind]}</span>
        {#if detail.page !== null}<span class="page">S. {detail.page}</span>{/if}
      </header>
      <div class="cols">
        <div class="orig">
          <h4>Original-Buchstelle</h4>
          <pre>{detail.chunkText}</pre>
        </div>
        <div class="sugg">
          <h4>KI-Vorschlag</h4>
          <textarea bind:value={editPayload} rows={20} spellcheck="false"></textarea>
        </div>
      </div>
      <footer>
        <button disabled={working} on:click={() => accept()}>Als Snippet speichern</button>
        <button disabled={working} on:click={() => accept('publish')}>Direkt veröffentlichen →</button>
        <button disabled={working} class="danger" on:click={reject}>Ablehnen</button>
      </footer>
    {/if}
  </article>

  {#if toast}<div class="toast" on:click={() => (toast = null)}>{toast}</div>{/if}
</div>

<style>
  /* Mentolder dark: brass #c9a978, sage #8fb39c, ink #15191a, paper #ece7dd, font Newsreader + Geist */
  .inbox { display: grid; grid-template-columns: 240px 320px 1fr; height: calc(100vh - 60px); background: #15191a; color: #ece7dd; font-family: 'Geist', system-ui, sans-serif; }
  .rail { padding: 1rem; border-right: 1px solid #2a2f31; overflow-y: auto; }
  .rail h3 { font-family: 'Newsreader', serif; font-weight: 500; color: #c9a978; margin-top: 1.25rem; }
  .rail select, .rail .chip { display: block; width: 100%; margin: 0.25rem 0; background: #1f2426; color: inherit; border: 1px solid #2a2f31; padding: 0.4rem; border-radius: 4px; }
  .rail .chip { display: flex; gap: 0.5rem; align-items: center; cursor: pointer; }
  .rate { margin-top: 1rem; padding: 0.5rem; border-radius: 4px; }
  .rate strong { font-size: 1.5rem; }
  .badge--ok { background: #1c2a23; color: #8fb39c; }
  .badge--warn { background: #3a1f1c; color: #d97a6c; }
  .badge--muted { background: #1f2426; color: #888; }
  .warn { font-size: 0.8rem; margin-top: 0.5rem; color: #d97a6c; }
  .list { padding: 1rem; border-right: 1px solid #2a2f31; overflow-y: auto; }
  .list h2 { font-family: 'Newsreader', serif; color: #c9a978; font-size: 1rem; margin-top: 1rem; }
  .list .count { color: #888; font-size: 0.85em; }
  .list ul { list-style: none; padding: 0; }
  .list li.active button { background: #2a2f31; }
  .list li button { width: 100%; text-align: left; background: transparent; color: inherit; border: none; padding: 0.4rem; cursor: pointer; border-radius: 4px; }
  .list li button:hover { background: #1f2426; }
  .empty { color: #888; padding: 2rem; }
  .empty code { background: #1f2426; padding: 0.1em 0.4em; border-radius: 3px; }
  .detail { padding: 1rem; overflow-y: auto; display: flex; flex-direction: column; }
  .detail header { display: flex; gap: 0.5rem; align-items: center; }
  .detail .kind { background: #c9a978; color: #15191a; padding: 0.2em 0.6em; border-radius: 3px; font-size: 0.85em; }
  .detail .page { color: #888; font-size: 0.85em; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; flex: 1; margin: 1rem 0; }
  .orig pre { background: #1f2426; padding: 1rem; border-radius: 4px; white-space: pre-wrap; font-family: 'Newsreader', serif; line-height: 1.5; max-height: 60vh; overflow-y: auto; }
  .sugg textarea { width: 100%; background: #1f2426; color: inherit; border: 1px solid #2a2f31; padding: 1rem; border-radius: 4px; font-family: 'Geist Mono', monospace; font-size: 0.85em; }
  footer { display: flex; gap: 0.5rem; padding-top: 1rem; }
  footer button { background: #8fb39c; color: #15191a; border: none; padding: 0.6em 1em; border-radius: 4px; cursor: pointer; font-weight: 500; }
  footer button.danger { background: #d97a6c; }
  footer button:disabled { opacity: 0.5; cursor: wait; }
  .toast { position: fixed; bottom: 1rem; right: 1rem; background: #c9a978; color: #15191a; padding: 0.8em 1.2em; border-radius: 4px; cursor: pointer; }
</style>
