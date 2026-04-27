<script lang="ts">
  import type { ReferenzItem } from '../../../lib/website-db';

  let { initialData }: { initialData: ReferenzItem[] } = $props();

  let items = $state(structuredClone(initialData));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/referenzen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  function addItem() { items = [...items, { id: crypto.randomUUID(), name: '', url: undefined, logoUrl: undefined, description: undefined }]; }
  function removeItem(i: number) { items = items.filter((_, idx) => idx !== i); }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
</script>

<div class="pt-6 pb-20 space-y-6">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Referenzen</h2>
      <p class="text-muted mt-1 text-sm">{items.length} Einträge</p>
    </div>
    <div class="flex gap-3">
      <button onclick={addItem} class="px-3 py-2 border border-dark-lighter text-muted rounded-lg text-sm hover:text-light">+ Referenz</button>
      <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
        {saving ? 'Speichere…' : 'Speichern'}
      </button>
    </div>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  {#each items as item, i}
    <div class="p-5 bg-dark-light rounded-xl border border-dark-lighter space-y-3">
      <div class="flex justify-between items-center">
        <span class="text-xs font-mono text-muted">{item.id.slice(0, 8)}</span>
        <button onclick={() => removeItem(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
      <div>
        <label class={labelCls}>Name *</label>
        <input type="text" bind:value={item.name} required class={inputCls} />
      </div>
      <div>
        <label class={labelCls}>Website-URL</label>
        <input type="url" bind:value={item.url} class={inputCls} placeholder="https://..." />
      </div>
      <div>
        <label class={labelCls}>Logo-URL</label>
        <input type="url" bind:value={item.logoUrl} class={inputCls} placeholder="https://..." />
      </div>
      <div>
        <label class={labelCls}>Beschreibung</label>
        <textarea bind:value={item.description} rows={2} class="{inputCls} resize-none"></textarea>
      </div>
    </div>
  {/each}
</div>
