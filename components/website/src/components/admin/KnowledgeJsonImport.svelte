<script lang="ts">
  let open = $state(false);
  let slug = $state('');
  let file = $state<File | null>(null);
  let status: 'idle' | 'uploading' | 'done' | 'error' = $state('idle');
  let done = $state(0);
  let total = $state(0);
  let errorMsg = $state('');

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
    if (file && !slug) slug = file.name.replace(/\.json$/i, '');
  }

  function openModal() {
    open = true;
    slug = '';
    file = null;
    status = 'idle';
    done = 0;
    total = 0;
    errorMsg = '';
  }

  function closeModal() {
    if (status === 'uploading') return;
    open = false;
  }

  async function submit() {
    if (!file || !slug.trim()) return;
    status = 'uploading';
    done = 0;
    total = 0;
    errorMsg = '';

    const fd = new FormData();
    fd.append('file', file);
    fd.append('slug', slug.trim());

    let response: Response;
    try {
      response = await fetch('/api/admin/knowledge/import/json', { method: 'POST', body: fd });
    } catch (err) {
      status = 'error';
      errorMsg = err instanceof Error ? err.message : 'Netzwerkfehler';
      return;
    }

    if (!response.ok || !response.body) {
      status = 'error';
      errorMsg = `HTTP ${response.status}`;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        try {
          const event = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
          if (event.type === 'start') total = event.total as number;
          if (event.type === 'progress') done = event.done as number;
          if (event.type === 'done') {
            done = total;
            status = 'done';
          }
          if (event.type === 'error') {
            status = 'error';
            errorMsg = event.message as string;
          }
        } catch { /* malformed SSE line — ignore */ }
      }
    }

    if (status === 'uploading') {
      status = 'error';
      errorMsg = 'Verbindung unterbrochen. Erneut versuchen (Import ist idempotent).';
    }
  }

  // Listen for open event dispatched from wissensquellen.astro
  if (typeof window !== 'undefined') {
    window.addEventListener('open-json-import-modal', openModal);
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={closeModal}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>JSON-Wissensquelle importieren</h2>

      <label>
        Collection-Name (Slug)
        <input type="text" bind:value={slug} placeholder="z.B. ki-brueckenschlag" disabled={status === 'uploading'} />
      </label>

      <label>
        JSON-Datei
        <input type="file" accept=".json" onchange={onFileChange} disabled={status === 'uploading'} />
      </label>

      {#if status === 'uploading' || status === 'done'}
        <div class="progress-wrap">
          <div class="progress-bar" style="width: {total > 0 ? Math.round((done / total) * 100) : 0}%"></div>
        </div>
        <p class="progress-label">{done} / {total} Chunks</p>
      {/if}

      {#if status === 'done'}
        <p class="success">✓ Fertig — {done} Chunks in "{slug}" importiert.</p>
        <button class="primary" onclick={() => { closeModal(); location.reload(); }}>Schließen</button>
      {:else if status === 'error'}
        <p class="error">{errorMsg}</p>
        <div class="actions">
          <button class="primary" onclick={submit} disabled={!file || !slug.trim()}>Erneut versuchen</button>
          <button class="secondary" onclick={closeModal}>Abbrechen</button>
        </div>
      {:else}
        <div class="actions">
          <button class="primary" onclick={submit} disabled={!file || !slug.trim() || status === 'uploading'}>
            {status === 'uploading' ? 'Importiere…' : 'Importieren'}
          </button>
          <button class="secondary" onclick={closeModal}>Abbrechen</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.5);
    display: flex; align-items: center; justify-content: center; z-index: 100;
  }
  .modal {
    background: var(--color-surface, #fff); padding: 2rem; border-radius: 8px;
    min-width: 380px; max-width: 500px; display: flex; flex-direction: column; gap: 1rem;
  }
  label { display: flex; flex-direction: column; gap: .25rem; font-size: .9rem; }
  input[type=text], input[type=file] { padding: .4rem .6rem; border: 1px solid var(--color-border, #ccc); border-radius: 4px; }
  .progress-wrap { height: 8px; background: var(--color-border, #eee); border-radius: 4px; overflow: hidden; }
  .progress-bar { height: 100%; background: var(--color-accent, #4a90e2); transition: width .2s; }
  .progress-label { font-size: .85rem; color: var(--color-muted, #888); margin: 0; }
  .success { color: var(--color-success, green); }
  .error { color: var(--color-danger, red); font-size: .9rem; }
  .actions { display: flex; gap: .5rem; }
</style>
