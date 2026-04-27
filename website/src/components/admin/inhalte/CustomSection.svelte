<script lang="ts">
  import type { CustomSection } from '../../../lib/website-db';

  let { section, onDeleted }: { section: CustomSection; onDeleted: () => void } = $props();

  let content = $state({ ...section.content });
  let saving = $state(false);
  let deleting = $state(false);
  let confirmDelete = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch(`/api/admin/inhalte/custom/${section.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  async function doDelete() {
    deleting = true;
    await fetch(`/api/admin/inhalte/custom/${section.slug}`, { method: 'DELETE' });
    onDeleted();
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
</script>

<div class="pt-6 pb-20 space-y-6">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">{section.title} <span class="text-gold text-lg">★</span></h2>
      <p class="text-muted mt-1 text-xs font-mono">slug: {section.slug}</p>
    </div>
    <div class="flex gap-3 items-center">
      {#if confirmDelete}
        <span class="text-xs text-muted">Sicher löschen?</span>
        <button onclick={doDelete} disabled={deleting} class="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500 disabled:opacity-50">Ja, löschen</button>
        <button onclick={() => confirmDelete = false} class="text-xs text-muted hover:text-light">Abbrechen</button>
      {:else}
        <button onclick={() => confirmDelete = true} class="px-3 py-2 text-red-400 border border-red-400/30 rounded-lg text-sm hover:bg-red-400/10">Löschen</button>
      {/if}
      <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
        {saving ? 'Speichere…' : 'Speichern'}
      </button>
    </div>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <div class="p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4">
    {#each section.fields as field}
      <div>
        <label class={labelCls}>{field.label}{field.required ? ' *' : ''}</label>
        {#if field.type === 'textarea'}
          <textarea bind:value={content[field.name]} rows={4} class="{inputCls} resize-none"></textarea>
        {:else if field.type === 'url'}
          <input type="url" bind:value={content[field.name]} class={inputCls} />
        {:else}
          <input type="text" bind:value={content[field.name]} class={inputCls} />
        {/if}
      </div>
    {/each}
    {#if section.fields.length === 0}
      <p class="text-muted text-sm">Keine Felder definiert. Abschnitt löschen und neu erstellen mit Feldern.</p>
    {/if}
  </div>
</div>
