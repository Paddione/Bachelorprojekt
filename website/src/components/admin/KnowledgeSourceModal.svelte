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
  let pasted = $state('');
  let docTitle = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  function openModal() {
    open = true;
    error = null;
    name = '';
    description = '';
    brand = 'beide';
    pasted = '';
    docTitle = '';
  }

  function closeModal() {
    if (busy) return;
    open = false;
  }

  async function submit() {
    busy = true; error = null;
    try {
      const colRes = await fetch('/api/admin/knowledge/collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, brand: brand === 'beide' ? null : brand }),
      });
      if (!colRes.ok) { error = (await colRes.json()).error ?? 'Fehler'; return; }
      const col = await colRes.json();
      if (pasted.trim()) {
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
</script>

{#if open}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-bg" onclick={closeModal}>
  <div class="modal" onclick={(e: MouseEvent) => e.stopPropagation()}>
    <h3>Neue Wissensquelle</h3>
    {#if error}<p class="err">{error}</p>{/if}
    <label>Name<input bind:value={name} required /></label>
    <label>Beschreibung<textarea bind:value={description} rows="2"></textarea></label>
    <label>Marke
      <select bind:value={brand}>
        <option value="beide">beide</option>
        <option value="mentolder">mentolder</option>
        <option value="korczewski">korczewski</option>
      </select>
    </label>
    <label>Dokument-Titel (optional)<input bind:value={docTitle} /></label>
    <label>Inhalt (Markdown / Klartext)<textarea bind:value={pasted} rows="10" placeholder="Hier einfügen…"></textarea></label>
    <div class="actions">
      <button onclick={closeModal} disabled={busy}>Abbrechen</button>
      <button onclick={submit} disabled={busy || !name.trim()}>{busy ? '…' : 'Anlegen'}</button>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
  .modal { background: var(--ink-800); border: 1px solid var(--ink-750); padding: 1.25rem; border-radius: 10px; min-width: 480px; max-width: 640px; display: flex; flex-direction: column; gap: 0.6rem; color: var(--fg); }
  label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 12px; color: var(--fg-soft); text-transform: uppercase; letter-spacing: 0.04em; }
  input, textarea, select { background: var(--ink-900); border: 1px solid var(--ink-750); color: var(--fg); border-radius: 6px; padding: 0.5rem; font-family: inherit; font-size: 13px; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
  button { background: var(--brass); color: var(--ink-900); border: none; padding: 0.55rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
  button:first-of-type { background: transparent; color: var(--fg); border: 1px solid var(--ink-750); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .err { color: #c96e6e; }
</style>
