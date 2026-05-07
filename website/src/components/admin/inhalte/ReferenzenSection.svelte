<script lang="ts">
  import type { ReferenzenConfig, ReferenzItem, ReferenzenType } from '../../../lib/website-db';

  let { initialData }: { initialData: ReferenzenConfig } = $props();

  let heading = $state(initialData.heading ?? '');
  let subheading = $state(initialData.subheading ?? '');
  let types = $state<ReferenzenType[]>(JSON.parse(JSON.stringify(initialData.types ?? [])));
  let items = $state<ReferenzItem[]>(JSON.parse(JSON.stringify(initialData.items ?? [])));

  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/referenzen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heading: heading.trim() || undefined,
          subheading: subheading.trim() || undefined,
          types,
          items,
        }),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  function addItem() {
    items = [...items, { id: crypto.randomUUID(), name: '', url: undefined, logoUrl: undefined, description: undefined, type: undefined }];
  }
  function removeItem(i: number) { items = items.filter((_, idx) => idx !== i); }

  function addType() {
    const id = crypto.randomUUID().slice(0, 8);
    types = [...types, { id, label: '' }];
  }
  function removeType(i: number) {
    const removed = types[i];
    types = types.filter((_, idx) => idx !== i);
    // Items previously tagged with the removed type fall back to "untyped"
    items = items.map((it) => it.type === removed.id ? { ...it, type: undefined } : it);
  }
  function moveType(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= types.length) return;
    const next = [...types];
    [next[i], next[j]] = [next[j], next[i]];
    types = next;
  }

  function moveItem(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    items = next;
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const smallBtnCls = 'px-2 py-1 text-xs border border-dark-lighter text-muted rounded hover:text-light disabled:opacity-30 disabled:cursor-not-allowed';
</script>

<div class="pt-6 pb-20 space-y-8">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Referenzen / Kooperationspartner</h2>
      <p class="text-muted mt-1 text-sm">{items.length} Einträge · {types.length} Gruppen</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Headings -->
  <div class="p-5 bg-dark-light rounded-xl border border-dark-lighter space-y-3">
    <h3 class="text-sm font-semibold text-light">Seiten-Überschrift</h3>
    <div>
      <label class={labelCls}>Überschrift</label>
      <input type="text" bind:value={heading} placeholder="Referenzen" class={inputCls} />
      <p class="text-xs text-muted mt-1">Leer lassen für Standard: „Referenzen“.</p>
    </div>
    <div>
      <label class={labelCls}>Unterüberschrift</label>
      <textarea bind:value={subheading} rows={2} placeholder="Unternehmen und Personen, die mir ihr Vertrauen geschenkt haben." class="{inputCls} resize-none"></textarea>
    </div>
  </div>

  <!-- Type / group manager -->
  <div class="p-5 bg-dark-light rounded-xl border border-dark-lighter space-y-3">
    <div class="flex justify-between items-center">
      <div>
        <h3 class="text-sm font-semibold text-light">Gruppen / Typen</h3>
        <p class="text-xs text-muted mt-1">Gruppen ordnen die Einträge auf der Seite. Reihenfolge bestimmt die Anzeige-Reihenfolge.</p>
      </div>
      <button onclick={addType} class="px-3 py-1.5 border border-dark-lighter text-muted rounded-lg text-xs hover:text-light">+ Gruppe</button>
    </div>
    {#if types.length === 0}
      <p class="text-xs text-muted italic">Keine Gruppen — alle Einträge erscheinen ohne Gruppierung.</p>
    {:else}
      <div class="space-y-2">
        {#each types as t, i (t.id)}
          <div class="flex gap-2 items-center">
            <span class="font-mono text-xs text-muted w-16 shrink-0">{t.id.slice(0, 6)}</span>
            <input type="text" bind:value={t.label} placeholder="Gruppenname (z.B. Mediation)" class="flex-1 px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50" />
            <button onclick={() => moveType(i, -1)} disabled={i === 0} class={smallBtnCls} aria-label="Nach oben">↑</button>
            <button onclick={() => moveType(i, 1)} disabled={i === types.length - 1} class={smallBtnCls} aria-label="Nach unten">↓</button>
            <button onclick={() => removeType(i)} class="px-2 py-1 text-xs text-red-400 hover:text-red-300" aria-label="Gruppe löschen">✕</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Items -->
  <div class="space-y-3">
    <div class="flex justify-between items-center">
      <h3 class="text-sm font-semibold text-light">Einträge</h3>
      <button onclick={addItem} class="px-3 py-1.5 border border-dark-lighter text-muted rounded-lg text-xs hover:text-light">+ Referenz</button>
    </div>

    {#each items as item, i (item.id)}
      <div class="p-5 bg-dark-light rounded-xl border border-dark-lighter space-y-3">
        <div class="flex justify-between items-center gap-2">
          <span class="text-xs font-mono text-muted">{item.id.slice(0, 8)}</span>
          <div class="flex gap-2 items-center">
            <button onclick={() => moveItem(i, -1)} disabled={i === 0} class={smallBtnCls} aria-label="Nach oben">↑</button>
            <button onclick={() => moveItem(i, 1)} disabled={i === items.length - 1} class={smallBtnCls} aria-label="Nach unten">↓</button>
            <button onclick={() => removeItem(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class={labelCls}>Name *</label>
            <input type="text" bind:value={item.name} required class={inputCls} />
          </div>
          <div>
            <label class={labelCls}>Gruppe / Typ</label>
            <select bind:value={item.type} class={inputCls}>
              <option value={undefined}>— ohne Gruppe —</option>
              {#each types as t}
                <option value={t.id}>{t.label || t.id.slice(0, 6)}</option>
              {/each}
            </select>
          </div>
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
</div>
