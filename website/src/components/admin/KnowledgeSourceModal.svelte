<script lang="ts">
  let {
    onCreated,
  }: {
    onCreated?: (id: string) => void;
  } = $props();

  let open = $state(false);
  let name = $state('');
  let description = $state('');
  let brand: 'mentolder' | 'korczewski' | 'beide' = $state('beide');
  let mode: 'paste' | 'pdf' = $state('paste');
  let pasted = $state('');
  let docTitle = $state('');
  let pdfFile = $state<File | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let info = $state<string | null>(null);

  function openModal() {
    open = true;
    error = null;
    info = null;
    name = '';
    description = '';
    brand = 'beide';
    mode = 'paste';
    pasted = '';
    docTitle = '';
    pdfFile = null;
  }

  function closeModal() {
    if (busy) return;
    open = false;
  }

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    pdfFile = input.files?.[0] ?? null;
    if (pdfFile && !docTitle) docTitle = pdfFile.name.replace(/\.pdf$/i, '');
    if (pdfFile && !name) name = pdfFile.name.replace(/\.pdf$/i, '');
  }

  async function submit() {
    busy = true; error = null; info = null;
    try {
      const colRes = await fetch('/api/admin/knowledge/collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, brand: brand === 'beide' ? null : brand }),
      });
      if (!colRes.ok) { error = (await colRes.json()).error ?? 'Fehler'; return; }
      const col = await colRes.json();

      if (mode === 'pdf' && pdfFile) {
        const fd = new FormData();
        fd.append('file', pdfFile);
        if (docTitle) fd.append('title', docTitle);
        const docRes = await fetch(`/api/admin/knowledge/collections/${col.id}/documents`, {
          method: 'POST', body: fd,
        });
        const docBody = await docRes.json().catch(() => ({}));
        if (!docRes.ok) { error = docBody.error ?? `PDF-Upload fehlgeschlagen (${docRes.status})`; return; }
        if (docRes.status === 202 && docBody.message) {
          info = docBody.message;
          // Don't auto-close so user can copy CLI hint.
          onCreated?.(col.id);
          return;
        }
      } else if (mode === 'paste' && pasted.trim()) {
        const docRes = await fetch(`/api/admin/knowledge/collections/${col.id}/documents`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: docTitle || name, rawText: pasted }),
        });
        if (!docRes.ok) { error = (await docRes.json()).error ?? 'Doc-Upload fehlgeschlagen'; return; }
      }
      onCreated?.(col.id);
      open = false;
    } finally { busy = false; }
  }

  // Listen for external open trigger (from the "+ Neue Wissensquelle" button in the page)
  import { onMount } from 'svelte';
  onMount(() => {
    const handler = () => openModal();
    window.addEventListener('open-wissensquellen-modal', handler);
    return () => window.removeEventListener('open-wissensquellen-modal', handler);
  });

  const canSubmit = $derived(
    !busy
    && !!name.trim()
    && (mode === 'paste' || (mode === 'pdf' && !!pdfFile)),
  );
</script>

{#if open}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-bg" onclick={closeModal}>
  <div class="modal" onclick={(e: MouseEvent) => e.stopPropagation()}>
    <h3>Neue Wissensquelle</h3>
    {#if error}<p class="err">{error}</p>{/if}
    {#if info}<p class="info">{info}</p>{/if}
    <label>Name<input bind:value={name} required /></label>
    <label>Beschreibung<textarea bind:value={description} rows="2"></textarea></label>
    <label>Marke
      <select bind:value={brand}>
        <option value="beide">beide</option>
        <option value="mentolder">mentolder</option>
        <option value="korczewski">korczewski</option>
      </select>
    </label>

    <div class="mode-tabs">
      <button type="button" class:active={mode === 'paste'} onclick={() => mode = 'paste'} disabled={busy}>Text einfügen</button>
      <button type="button" class:active={mode === 'pdf'} onclick={() => mode = 'pdf'} disabled={busy}>PDF hochladen</button>
    </div>

    <label>Dokument-Titel (optional)<input bind:value={docTitle} /></label>

    {#if mode === 'paste'}
      <label>Inhalt (Markdown / Klartext)<textarea bind:value={pasted} rows="10" placeholder="Hier einfügen…"></textarea></label>
    {:else}
      <label>PDF-Datei
        <input type="file" accept="application/pdf,.pdf" onchange={onFileChange} />
      </label>
      {#if pdfFile}
        <p class="hint">{pdfFile.name} · {(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
      {/if}
      <p class="hint">Max. 25 MB. Große Bücher (≫ 200 Chunks) bitte via CLI: <code>task coaching:ingest -- &lt;datei&gt; &lt;slug&gt;</code></p>
    {/if}

    <div class="actions">
      <button onclick={closeModal} disabled={busy}>{info ? 'Schließen' : 'Abbrechen'}</button>
      <button onclick={submit} disabled={!canSubmit}>{busy ? '…' : 'Anlegen'}</button>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
  .modal { background: var(--ink-800); border: 1px solid var(--ink-750); padding: 1.25rem; border-radius: 10px; min-width: 480px; max-width: 640px; display: flex; flex-direction: column; gap: 0.6rem; color: var(--fg); }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 12px; color: var(--fg-soft); text-transform: uppercase; letter-spacing: 0.04em; }
  input, textarea, select { background: var(--ink-900); border: 1px solid var(--ink-750); color: var(--fg); border-radius: 6px; padding: 0.5rem; font-family: inherit; font-size: 13px; }
  input[type="file"] { padding: 0.4rem; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
  button { background: var(--brass); color: var(--ink-900); border: none; padding: 0.55rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
  .actions button:first-of-type { background: transparent; color: var(--fg); border: 1px solid var(--ink-750); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .err { color: #c96e6e; }
  .info { color: var(--brass); background: rgba(201, 165, 92, 0.08); border: 1px solid rgba(201, 165, 92, 0.3); border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 12px; }
  .mode-tabs { display: flex; gap: 0.25rem; padding: 0.25rem; background: var(--ink-900); border-radius: 6px; border: 1px solid var(--ink-750); }
  .mode-tabs button { flex: 1; background: transparent; color: var(--fg-soft); padding: 0.4rem; font-size: 12px; font-weight: 500; }
  .mode-tabs button.active { background: var(--ink-750); color: var(--fg); }
  .hint { margin: 0; color: var(--fg-soft); font-size: 11px; }
  .hint code { background: var(--ink-900); padding: 0.05rem 0.3rem; border-radius: 3px; font-family: var(--font-mono); }
</style>
