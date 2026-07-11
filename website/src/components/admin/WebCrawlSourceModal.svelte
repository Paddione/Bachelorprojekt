<script lang="ts">
  import type { Snippet } from 'svelte';
  import AdminModal from './ui/AdminModal.svelte';

  let {
    onCreated,
  }: {
    onCreated?: (id: string) => void;
  } = $props();

  let open = $state(false);
  let name = $state('');
  let description = $state('');
  let brand: 'mentolder' | 'korczewski' | 'beide' = $state('beide');
  let startUrl = $state('');
  let maxDepth = $state(3);
  let maxPages = $state(200);
  let includePattern = $state('');
  let embeddingModel: 'voyage-multilingual-2' | 'bge-m3' = $state('voyage-multilingual-2');
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

  import { onMount } from 'svelte';
  onMount(() => {
    const handler = () => openModal();
    window.addEventListener('open-web-crawl-modal', handler);
    return () => window.removeEventListener('open-web-crawl-modal', handler);
  });
</script>

{#snippet modalContent()}
  <div class="modal-content">
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
{/snippet}

<AdminModal 
  bind:open 
  title="Neue Web-Quelle"
  onclose={closeModal}
  body={modalContent}
  footer={undefined}
/>

<style>
  .err { color: #c96e6e; }
  .info { color: var(--brass); background: rgba(201, 165, 92, 0.08); border: 1px solid rgba(201, 165, 92, 0.3); border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 12px; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
  button { background: var(--brass); color: var(--ink-900); border: none; padding: 0.55rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
  .actions button:first-of-type { background: transparent; color: var(--fg); border: 1px solid var(--ink-750); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .mode-tabs { display: flex; gap: 0.25rem; padding: 0.25rem; background: var(--ink-900); border-radius: 6px; border: 1px solid var(--ink-750); }
  .mode-tabs button { flex: 1; background: transparent; color: var(--fg-soft); padding: 0.4rem; font-size: 12px; font-weight: 500; }
  .mode-tabs button.active { background: var(--ink-750); color: var(--fg); }
  .hint { margin: 0; color: var(--fg-soft); font-size: 11px; }
  .hint code { background: var(--ink-900); padding: 0.05rem 0.3rem; border-radius: 3px; font-family: var(--font-mono); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
</style>
