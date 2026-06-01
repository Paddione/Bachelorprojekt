<script lang="ts">
  import type { Prompt } from '../../lib/prompt-library-db';

  const { prompts: initialPrompts }: { prompts: Prompt[] } = $props();

  let prompts = $state<Prompt[]>(initialPrompts);
  let saving = $state(false);
  let error = $state('');

  // Editor state — editingId null = "new prompt" form.
  let editingId = $state<number | null>(null);
  let fTitle = $state('');
  let fCategory = $state('canned_reply');
  let fBody = $state('');
  let fDescription = $state('');
  let fActive = $state(true);

  function resetForm() {
    editingId = null;
    fTitle = '';
    fCategory = 'canned_reply';
    fBody = '';
    fDescription = '';
    fActive = true;
    error = '';
  }

  function editPrompt(p: Prompt) {
    editingId = p.id;
    fTitle = p.title;
    fCategory = p.category;
    fBody = p.body;
    fDescription = p.description ?? '';
    fActive = p.isActive;
    error = '';
  }

  async function save() {
    if (!fTitle.trim() || !fBody.trim() || saving) {
      error = 'Titel und Inhalt sind erforderlich.';
      return;
    }
    saving = true;
    error = '';
    const payload = {
      title: fTitle.trim(),
      body: fBody,
      category: fCategory.trim() || 'canned_reply',
      description: fDescription.trim() || null,
      isActive: fActive,
    };
    const url = editingId === null
      ? '/api/admin/prompt-library'
      : `/api/admin/prompt-library/${editingId}`;
    const method = editingId === null ? 'POST' : 'PUT';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        error = 'Speichern fehlgeschlagen.';
        return;
      }
      const data = (await res.json()) as { prompt: Prompt };
      if (editingId === null) {
        prompts = [data.prompt, ...prompts.filter(p => p.id !== data.prompt.id)];
      } else {
        prompts = prompts.map(p => (p.id === data.prompt.id ? data.prompt : p));
      }
      resetForm();
    } catch {
      error = 'Netzwerkfehler beim Speichern.';
    } finally {
      saving = false;
    }
  }

  async function toggleActive(p: Prompt) {
    try {
      const res = await fetch(`/api/admin/prompt-library/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: p.title,
          body: p.body,
          category: p.category,
          description: p.description,
          isActive: !p.isActive,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { prompt: Prompt };
        prompts = prompts.map(x => (x.id === data.prompt.id ? data.prompt : x));
      }
    } catch { /* ignore */ }
  }

  async function remove(p: Prompt) {
    if (!confirm(`Vorlage „${p.title}“ löschen?`)) return;
    try {
      const res = await fetch(`/api/admin/prompt-library/${p.id}`, { method: 'DELETE' });
      if (res.ok) {
        prompts = prompts.filter(x => x.id !== p.id);
        if (editingId === p.id) resetForm();
      }
    } catch { /* ignore */ }
  }
</script>

<div class="prompt-mgr">
  <header class="mgr-head">
    <h1>Prompt-Bibliothek</h1>
    <p class="sub">Wiederverwendbare Vorlagen für schnelle, konsistente Antworten. Aktive Vorlagen erscheinen im „Vorlage einfügen“-Menü der Nachrichten- und Raum-Ansicht.</p>
  </header>

  <div class="mgr-grid">
    <section class="editor" aria-label="Vorlage bearbeiten">
      <h2>{editingId === null ? 'Neue Vorlage' : 'Vorlage bearbeiten'}</h2>
      <label>
        <span>Titel</span>
        <input bind:value={fTitle} placeholder="z. B. Begrüßung Erstgespräch" maxlength="200" />
      </label>
      <label>
        <span>Kategorie</span>
        <input bind:value={fCategory} placeholder="canned_reply" maxlength="100" />
      </label>
      <label>
        <span>Inhalt</span>
        <textarea bind:value={fBody} placeholder="Der einzufügende Text…" rows="6"></textarea>
      </label>
      <label>
        <span>Beschreibung (optional)</span>
        <input bind:value={fDescription} placeholder="Wann wird diese Vorlage verwendet?" maxlength="500" />
      </label>
      <label class="chk">
        <input type="checkbox" bind:checked={fActive} />
        <span>Aktiv (im Einfüge-Menü sichtbar)</span>
      </label>
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <div class="actions">
        {#if editingId !== null}
          <button class="ghost" onclick={resetForm}>Abbrechen</button>
        {/if}
        <button class="primary" disabled={saving || !fTitle.trim() || !fBody.trim()} onclick={save}>
          {saving ? 'Speichert…' : (editingId === null ? 'Anlegen' : 'Speichern')}
        </button>
      </div>
    </section>

    <section class="list" aria-label="Vorlagen">
      <h2>Vorlagen ({prompts.length})</h2>
      {#if prompts.length === 0}
        <p class="empty">Noch keine Vorlagen. Lege links die erste an.</p>
      {:else}
        <ul>
          {#each prompts as p (p.id)}
            <li class="row {p.isActive ? '' : 'inactive'} {editingId === p.id ? 'editing' : ''}">
              <div class="row-main">
                <div class="row-title">
                  <span class="title">{p.title}</span>
                  <span class="cat">{p.category}</span>
                  {#if !p.isActive}<span class="badge-off">inaktiv</span>{/if}
                </div>
                <p class="row-body">{p.body}</p>
                {#if p.description}<p class="row-desc">{p.description}</p>{/if}
                <p class="row-meta">{p.usageCount}× verwendet</p>
              </div>
              <div class="row-actions">
                <button class="mini" onclick={() => editPrompt(p)} aria-label={`Vorlage ${p.title} bearbeiten`}>Bearbeiten</button>
                <button class="mini" onclick={() => toggleActive(p)} aria-label={`Vorlage ${p.title} ${p.isActive ? 'deaktivieren' : 'aktivieren'}`}>
                  {p.isActive ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button class="mini danger" onclick={() => remove(p)} aria-label={`Vorlage ${p.title} löschen`}>Löschen</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>

<style>
  .prompt-mgr { max-width: 1100px; }
  .mgr-head h1 { margin: 0 0 4px; font-size: 22px; }
  .mgr-head .sub { color: #888; font-size: 13px; margin: 0 0 18px; max-width: 720px; }
  .mgr-grid { display: grid; grid-template-columns: 360px 1fr; gap: 20px; align-items: start; }
  @media (max-width: 820px) { .mgr-grid { grid-template-columns: 1fr; } }

  .editor, .list { background: #16162a; border: 1px solid #2a2a3e; border-radius: 8px; padding: 16px; }
  .editor h2, .list h2 { margin: 0 0 12px; font-size: 15px; }
  .editor label { display: block; margin-bottom: 10px; }
  .editor label > span { display: block; font-size: 12px; color: #aaa; margin-bottom: 4px; }
  .editor input[type="text"], .editor input:not([type]), .editor textarea {
    width: 100%; box-sizing: border-box; background: #1e1e2e; color: #e8e8f0;
    border: 1px solid #374151; border-radius: 6px; padding: 8px; font-size: 13px;
  }
  .editor textarea { resize: vertical; font-family: inherit; }
  .editor label.chk { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #ccc; }
  .editor label.chk > span { margin: 0; }
  .err { color: #fca5a5; font-size: 12px; margin: 4px 0 0; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  button { cursor: pointer; border: none; border-radius: 6px; font-size: 13px; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .primary { background: #7c6ff7; color: #fff; padding: 8px 16px; font-weight: 600; }
  .ghost { background: #374151; color: #ccc; padding: 8px 14px; }

  .list ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .empty { color: #555; font-size: 13px; }
  .row { display: flex; justify-content: space-between; gap: 12px; background: #1e1e2e; border: 1px solid #2a2a3e; border-radius: 6px; padding: 12px; }
  .row.inactive { opacity: .6; }
  .row.editing { border-color: #7c6ff7; }
  .row-main { min-width: 0; }
  .row-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .title { font-weight: 600; font-size: 14px; }
  .cat { font-size: 10px; color: #888; background: #2a2a3e; padding: 1px 6px; border-radius: 4px; }
  .badge-off { font-size: 10px; color: #fca5a5; background: #3a1f1f; padding: 1px 6px; border-radius: 4px; }
  .row-body { margin: 6px 0 0; font-size: 12px; color: #ccc; white-space: pre-wrap; max-height: 5em; overflow: hidden; }
  .row-desc { margin: 4px 0 0; font-size: 11px; color: #888; font-style: italic; }
  .row-meta { margin: 4px 0 0; font-size: 10px; color: #666; }
  .row-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
  .mini { background: #2a2a3e; color: #ccc; padding: 4px 10px; font-size: 11px; }
  .mini:hover { background: #374151; }
  .mini.danger { background: #3a1f1f; color: #fca5a5; }
</style>
