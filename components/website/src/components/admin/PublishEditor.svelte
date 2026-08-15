<script lang="ts">
  import { validateQuoteLength } from '../../lib/quote-validator';
  import type { Snippet } from '../../lib/coaching-db';

  export let snippet: Snippet;
  export let bookTitle: string;

  type Surface = 'questionnaire' | 'brett' | 'chatroom' | 'assistant';

  let targetSurface: Surface = 'questionnaire';
  let templateId: string | null = null;
  let saveError = '';
  let publishing = false;

  let q = { title: snippet.title, question: snippet.body, followup: '' };
  let a = { title: snippet.title, body: snippet.body, tags: snippet.tags.join(', ') };
  let br = { name: snippet.title, instructions: snippet.body };
  let cr = { title: snippet.title, script: snippet.body };

  function currentPayload(): Record<string, unknown> {
    switch (targetSurface) {
      case 'questionnaire': return { title: q.title, question: q.question, followup: q.followup, answerType: 'multiline' };
      case 'assistant':     return { title: a.title, body: a.body, tags: a.tags.split(',').map(s => s.trim()).filter(Boolean) };
      case 'brett':         return { name: br.name, instructions: br.instructions };
      case 'chatroom':      return { title: cr.title, script: cr.script };
    }
  }

  function candidateText(): string {
    const p = currentPayload();
    return Object.values(p).filter((v) => typeof v === 'string').join(' ');
  }

  $: quoteState = validateQuoteLength({ source: snippet.body, candidate: candidateText() });

  async function saveDraft(): Promise<void> {
    saveError = '';
    if (!templateId) {
      const r = await fetch(`/api/admin/coaching/snippets/${snippet.id}/draft-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSurface, payload: currentPayload() }),
      });
      if (!r.ok) { saveError = `Save failed (${r.status})`; return; }
      const t = await r.json();
      templateId = t.id;
    } else {
      const r = await fetch(`/api/admin/coaching/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: currentPayload() }),
      });
      if (!r.ok) { saveError = `Save failed (${r.status})`; return; }
      const t = await r.json();
      templateId = t.id;
    }
  }

  async function publish(): Promise<void> {
    if (!templateId) await saveDraft();
    if (!templateId) return;
    publishing = true;
    try {
      const r = await fetch(`/api/admin/coaching/templates/${templateId}/publish`, { method: 'POST' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        saveError = body.error ?? `Publish failed (${r.status})`;
        return;
      }
      window.dispatchEvent(new CustomEvent('coaching:template-published'));
      window.location.href = '/admin/knowledge/templates';
    } finally {
      publishing = false;
    }
  }

  function citationLine(): string {
    const page = snippet.page ? `, S. ${snippet.page}` : '';
    return `Quelle: ${bookTitle}${page}`;
  }
</script>

<div class="editor">
  <div class="left">
    <h2>Veröffentlichen: „{snippet.title}"</h2>
    <p class="src">{citationLine()}</p>

    <div class="surface-row">
      {#each ['questionnaire','assistant','brett','chatroom'] as s (s)}
        <button class="surface" class:selected={targetSurface === s} on:click={() => (targetSurface = s)}>
          {s === 'questionnaire' ? 'Questionnaire' : s === 'assistant' ? 'Assistant' : s === 'brett' ? 'Brett' : 'Chatroom'}
        </button>
      {/each}
    </div>

    {#if !quoteState.ok}
      <div class="quote-warn">
        ⚠ §51 UrhG-Schwelle überschritten: {quoteState.violation.matchedChars} Zeichen wörtliches Zitat.
        <span class="sample">"{quoteState.violation.sample}"</span>
        Paraphrasiere weiter, bevor du veröffentlichen kannst.
      </div>
    {/if}

    {#if targetSurface === 'questionnaire'}
      <label>Titel <input bind:value={q.title} /></label>
      <label>Frage <textarea bind:value={q.question} rows="4"></textarea></label>
      <label>Folgefrage (optional) <input bind:value={q.followup} /></label>
    {:else if targetSurface === 'assistant'}
      <label>Titel <input bind:value={a.title} /></label>
      <label>Text <textarea bind:value={a.body} rows="6"></textarea></label>
      <label>Tags (Komma) <input bind:value={a.tags} /></label>
    {:else if targetSurface === 'brett'}
      <label>Name <input bind:value={br.name} /></label>
      <label>Anleitung <textarea bind:value={br.instructions} rows="6"></textarea></label>
      <p class="muted">Brett-Cascade ist in Phase 2b geplant — wird aktuell nur als Template gespeichert.</p>
    {:else}
      <label>Titel <input bind:value={cr.title} /></label>
      <label>Phasen-Skript <textarea bind:value={cr.script} rows="6"></textarea></label>
      <p class="muted">Chatroom-Cascade ist in Phase 2b geplant — wird aktuell nur als Template gespeichert.</p>
    {/if}

    {#if saveError}<p class="error">{saveError}</p>{/if}

    <div class="actions">
      <button on:click={saveDraft} disabled={publishing}>Als Entwurf speichern</button>
      <button class="primary" on:click={publish} disabled={publishing || !quoteState.ok}>
        {publishing ? 'Veröffentliche…' : 'Veröffentlichen'}
      </button>
    </div>
  </div>

  <div class="right">
    <h3>Vorschau (Klient sieht das)</h3>
    {#if targetSurface === 'questionnaire'}
      <article class="preview-card">
        <h4>{q.title || 'Untitled'}</h4>
        <p>{q.question}</p>
        {#if q.followup}<p class="followup">{q.followup}</p>{/if}
        <footer>{citationLine()}</footer>
      </article>
    {:else if targetSurface === 'assistant'}
      <article class="preview-card chat">
        <p>{a.body}</p>
        <footer>↳ {citationLine()}</footer>
      </article>
    {:else if targetSurface === 'brett'}
      <article class="preview-card">
        <h4>{br.name || 'Untitled'}</h4>
        <pre>{br.instructions}</pre>
        <footer>{citationLine()}</footer>
      </article>
    {:else}
      <article class="preview-card">
        <h4>{cr.title || 'Untitled'}</h4>
        <pre>{cr.script}</pre>
        <footer>{citationLine()}</footer>
      </article>
    {/if}
  </div>
</div>

<style>
  .editor { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  h2 { font-family: 'Newsreader', Georgia, serif; font-weight: 400; font-size: 1.4rem; margin: 0 0 0.4rem; }
  .src { color: var(--text-muted, #888); font-size: 0.85rem; margin: 0 0 1rem; }
  .surface-row { display: flex; gap: 0.4rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .surface { padding: 0.4rem 0.75rem; border: 1px solid var(--line, #ddd); background: transparent; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
  .surface.selected { border-color: var(--brass, #c9a55c); background: rgba(201,165,92,0.15); color: var(--brass, #c9a55c); }
  label { display: block; margin: 0.7rem 0; font-size: 0.85rem; color: var(--text-muted, #555); }
  label input, label textarea { display: block; width: 100%; margin-top: 0.25rem; padding: 0.45rem; border: 1px solid var(--line, #ddd); border-radius: 4px; font-size: 0.92rem; }
  .actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
  .actions button { padding: 0.5rem 1rem; border: 1px solid var(--line, #ddd); background: transparent; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
  .actions button.primary { background: var(--brass, #c9a55c); color: #1a1817; border-color: var(--brass, #c9a55c); }
  .actions button:disabled { opacity: 0.5; cursor: not-allowed; }
  .quote-warn { background: rgba(176,107,74,0.15); border-left: 3px solid #b06b4a; padding: 0.6rem 0.9rem; margin: 0.5rem 0 1rem; font-size: 0.85rem; color: #b06b4a; }
  .quote-warn .sample { display: block; margin-top: 0.3rem; font-style: italic; color: #555; }
  .muted { color: var(--text-muted, #888); font-size: 0.78rem; margin-top: 0.5rem; }
  .error { color: #b06b4a; font-size: 0.85rem; }

  .right { background: var(--bg-2, #f7f5f2); padding: 1rem; border-radius: 8px; }
  .right h3 { font-size: 0.74rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted, #888); margin: 0 0 0.6rem; font-weight: 500; }
  .preview-card { background: var(--bg, #fff); border: 1px solid var(--line, #e5e2dd); border-radius: 6px; padding: 1rem; }
  .preview-card h4 { margin: 0 0 0.5rem; font-family: 'Newsreader', Georgia, serif; font-weight: 400; }
  .preview-card pre { white-space: pre-wrap; font-family: inherit; }
  .preview-card .followup { color: var(--text-muted, #555); }
  .preview-card footer { margin-top: 0.7rem; padding-top: 0.5rem; border-top: 1px dashed var(--line, #ddd); font-size: 0.78rem; color: var(--text-muted, #888); }
  .preview-card.chat footer { color: var(--brass, #c9a55c); }
</style>
