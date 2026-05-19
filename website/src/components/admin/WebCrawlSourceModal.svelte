<script lang="ts">
  import { onMount } from 'svelte';

  let {
    onCreated,
  }: {
    onCreated?: (id: string) => void;
  } = $props();

  let open        = $state(false);
  let name        = $state('');
  let description = $state('');
  let brand: 'mentolder' | 'korczewski' | 'beide' = $state('beide');
  let startUrl    = $state('');
  let maxDepth    = $state(3);
  let maxPages    = $state(200);
  let includePattern = $state('');
  let embeddingModel: 'voyage-multilingual-2' | 'bge-m3' = $state('voyage-multilingual-2');
  let busy        = $state(false);
  let error       = $state<string | null>(null);
  let info        = $state<string | null>(null);

  function openModal() {
    open = true;
    error = null;
    info = null;
    name = '';
    description = '';
    brand = 'beide';
    startUrl = '';
    maxDepth = 3;
    maxPages = 200;
    includePattern = '';
    embeddingModel = 'voyage-multilingual-2';
  }

  function closeModal() {
    if (busy) return;
    open = false;
  }

  const canSubmit = $derived(
    !busy && !!name.trim() && !!startUrl.trim(),
  );

  async function submit() {
    busy = true; error = null; info = null;
    try {
      let parsedUrl: URL;
      try { parsedUrl = new URL(startUrl.trim()); } catch {
        error = 'Bitte eine gültige URL eingeben (z.B. https://example.com).';
        return;
      }
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        error = 'Nur http:// und https:// URLs sind erlaubt.';
        return;
      }

      const crawlConfig = {
        startUrl:       parsedUrl.href,
        maxDepth:       Number(maxDepth) || 3,
        maxPages:       Number(maxPages) || 200,
        includePattern: includePattern.trim() || undefined,
      };

      const colRes = await fetch('/api/admin/knowledge/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        name.trim(),
          description: description.trim() || undefined,
          brand:       brand === 'beide' ? null : brand,
          source:      'web_crawl',
          embeddingModel,
          crawlConfig,
        }),
      });

      if (!colRes.ok) {
        error = (await colRes.json()).error ?? 'Fehler beim Anlegen';
        return;
      }

      const col = await colRes.json();
      info = `Sammlung "${col.name}" angelegt. Crawl kann jetzt in der Tabelle gestartet werden.`;
      onCreated?.(col.id);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    const handler = () => openModal();
    window.addEventListener('open-web-crawl-modal', handler);
    return () => window.removeEventListener('open-web-crawl-modal', handler);
  });
</script>

{#if open}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-bg" onclick={closeModal}>
  <div class="modal" onclick={(e: MouseEvent) => e.stopPropagation()}>
    <h3>Neue Web-Quelle</h3>
    {#if error}<p class="err">{error}</p>{/if}
    {#if info}<p class="info">{info}</p>{/if}

    <label>Name<input bind:value={name} required placeholder="z.B. Firma Website" /></label>
    <label>Beschreibung<textarea bind:value={description} rows="2"></textarea></label>
    <label>Marke
      <select bind:value={brand}>
        <option value="beide">beide</option>
        <option value="mentolder">mentolder</option>
        <option value="korczewski">korczewski</option>
      </select>
    </label>

    <label>Einbettungsmodell
      <select bind:value={embeddingModel}>
        <option value="voyage-multilingual-2">Voyage (Cloud)</option>
        <option value="bge-m3">Lokal (bge-m3)</option>
      </select>
    </label>

    <label>Start-URL (Pflichtfeld)
      <input bind:value={startUrl} required type="url"
             placeholder="https://example.com" />
    </label>

    <div class="row">
      <label>Max. Tiefe
        <input bind:value={maxDepth} type="number" min="1" max="10" />
      </label>
      <label>Max. Seiten
        <input bind:value={maxPages} type="number" min="1" max="5000" />
      </label>
    </div>

    <label>URL-Filter (Regex, optional)
      <input bind:value={includePattern} type="text"
             placeholder="z.B. /blog/ oder https://example.com/docs/.*" />
      <span class="hint">Nur URLs die diesem Muster entsprechen werden gecrawlt.</span>
    </label>

    <div class="actions">
      <button onclick={closeModal} disabled={busy}>{info ? 'Schließen' : 'Abbrechen'}</button>
      <button onclick={submit} disabled={!canSubmit}>{busy ? '…' : 'Anlegen'}</button>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
  .modal { background: var(--ink-800); border: 1px solid var(--ink-750); padding: 1.25rem; border-radius: 10px; min-width: 480px; max-width: 600px; display: flex; flex-direction: column; gap: 0.6rem; color: var(--fg); }
  h3 { margin: 0; font-size: 1rem; font-weight: 700; }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 12px; color: var(--fg-soft); text-transform: uppercase; letter-spacing: 0.04em; }
  input, textarea, select { background: var(--ink-900); border: 1px solid var(--ink-750); color: var(--fg); border-radius: 6px; padding: 0.5rem; font-family: inherit; font-size: 13px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
  button { background: var(--brass); color: var(--ink-900); border: none; padding: 0.55rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
  .actions button:first-of-type { background: transparent; color: var(--fg); border: 1px solid var(--ink-750); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .err  { color: #c96e6e; margin: 0; font-size: 13px; }
  .info { color: var(--brass); background: rgba(201,165,92,0.08); border: 1px solid rgba(201,165,92,0.3); border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 12px; margin: 0; }
  .hint { color: var(--fg-soft); font-size: 11px; text-transform: none; letter-spacing: 0; font-weight: 400; }
</style>
