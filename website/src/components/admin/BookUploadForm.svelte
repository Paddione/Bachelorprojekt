<script lang="ts">
  let file = $state<File | null>(null);
  let title = $state('');
  let author = $state('');
  let licenseNote = $state('');
  let uploading = $state(false);
  let error = $state('');
  let showForm = $state(false);

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
    if (file && !title) {
      title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) {
      file = f;
      if (!title) title = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    }
  }

  async function upload() {
    if (!file || !title.trim()) return;
    uploading = true;
    error = '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title.trim());
      fd.append('author', author.trim());
      fd.append('licenseNote', licenseNote.trim());
      const res = await fetch('/api/admin/coaching/books/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { error = data.error ?? 'Fehler beim Hochladen.'; return; }
      window.location.reload();
    } catch {
      error = 'Verbindungsfehler.';
    } finally {
      uploading = false;
    }
  }
</script>

{#if !showForm}
  <button onclick={() => showForm = true} class="btn-primary">+ Buch hochladen</button>
{:else}
  <div class="upload-box">
    <div
      class="dropzone"
      ondragover={(e) => e.preventDefault()}
      ondrop={onDrop}
      role="region"
      aria-label="Datei ablegen"
    >
      {#if file}
        <p class="filename">📄 {file.name}</p>
        <button type="button" onclick={() => file = null} class="btn-ghost">Andere Datei wählen</button>
      {:else}
        <p>PDF oder EPUB hier ablegen</p>
        <label class="btn-secondary">
          Datei auswählen
          <input type="file" accept=".pdf,.epub" onchange={onFileChange} hidden />
        </label>
      {/if}
    </div>

    <div class="fields">
      <label>
        Titel <span class="required">*</span>
        <input type="text" bind:value={title} placeholder="z.B. KI-Coaching" />
      </label>
      <label>
        Autor
        <input type="text" bind:value={author} placeholder="z.B. Geissler" />
      </label>
      <label>
        Lizenzhinweis
        <input type="text" bind:value={licenseNote} placeholder="z.B. Privatkopie zum internen Gebrauch" />
      </label>
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="actions">
      <button type="button" onclick={() => { showForm = false; error = ''; }} class="btn-ghost" disabled={uploading}>
        Abbrechen
      </button>
      <button type="button" onclick={upload} class="btn-primary" disabled={uploading || !file || !title.trim()}>
        {uploading ? 'Wird eingelesen…' : 'Hochladen & Einlesen'}
      </button>
    </div>
    {#if uploading}
      <p class="hint">Das Einlesen dauert 30–120 Sekunden — bitte nicht schließen.</p>
    {/if}
  </div>
{/if}

<style>
  .upload-box { border: 1px solid var(--line, #ddd); border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; }
  .dropzone { border: 2px dashed var(--brass, #c9a55c); border-radius: 6px; padding: 1.25rem; text-align: center; background: var(--bg-2, #f7f5f2); margin-bottom: 1rem; }
  .dropzone p { color: var(--text-muted, #888); font-size: .875rem; margin: 0 0 .5rem; }
  .filename { color: var(--text, #1a1a1a) !important; font-weight: 500; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-bottom: 1rem; }
  .fields label:last-child { grid-column: 1 / -1; }
  label { display: flex; flex-direction: column; font-size: .8rem; color: var(--text-muted, #666); gap: .25rem; }
  input[type=text] { padding: .35rem .6rem; border: 1px solid var(--line, #ddd); border-radius: 4px; font-size: .875rem; }
  .required { color: var(--brass, #c9a55c); }
  .actions { display: flex; justify-content: flex-end; gap: .5rem; }
  .error { color: #c00; font-size: .8rem; margin: .5rem 0; }
  .hint { color: var(--text-muted, #888); font-size: .78rem; margin-top: .5rem; text-align: center; }
  .btn-primary { padding: .4rem 1rem; background: var(--brass, #c9a55c); color: #fff; border: none; border-radius: 6px; font-size: .85rem; font-weight: 600; cursor: pointer; }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .btn-secondary { display: inline-block; padding: .3rem .7rem; border: 1px solid var(--line, #ddd); border-radius: 4px; font-size: .8rem; cursor: pointer; background: var(--bg, #fff); }
  .btn-ghost { background: none; border: 1px solid var(--line, #ddd); border-radius: 4px; padding: .3rem .6rem; font-size: .8rem; cursor: pointer; color: var(--text-muted, #666); }
</style>