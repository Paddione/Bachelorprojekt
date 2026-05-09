<script lang="ts">
  import type { UebermichContent } from '../../../lib/website-db';

  let { initialData }: { initialData: UebermichContent } = $props();

  const raw = JSON.parse(JSON.stringify(initialData));
  // Ensure warumdieserName is always an object so the form bindings don't crash
  if (!raw.warumdieserName) {
    raw.warumdieserName = { title: 'Warum dieser Name', text: '' };
  }
  let data = $state(raw);
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/uebermich/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler beim Speichern.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  function addMilestone() { data.milestones = [...data.milestones, { year: '', title: '', desc: '' }]; }
  function removeMilestone(i: number) { data.milestones = data.milestones.filter((_, idx) => idx !== i); }
  function addNotDoing() { data.notDoing = [...data.notDoing, { title: '', text: '' }]; }
  function removeNotDoing(i: number) { data.notDoing = data.notDoing.filter((_, idx) => idx !== i); }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Über mich</h2>
      <p class="text-muted mt-1 text-sm">Seiteninhalte bearbeiten</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Seiten-Header</h3>
    <div>
      <label class={labelCls}>Subheadline (goldene Zeile)</label>
      <input type="text" bind:value={data.subheadline} class={inputCls} />
    </div>
    <div>
      <label class={labelCls}>Seitenüberschrift</label>
      <input type="text" bind:value={data.pageHeadline} class={inputCls} />
    </div>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Intro-Absätze</h3>
    {#each data.introParagraphs as _, i}
      <div>
        <label class={labelCls}>Absatz {i + 1}</label>
        <textarea bind:value={data.introParagraphs[i]} rows={3} class="{inputCls} resize-none"></textarea>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Abschnitte</h3>
    {#each data.sections as sec, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div>
          <label class={labelCls}>Titel {i + 1}</label>
          <input type="text" bind:value={sec.title} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Inhalt {i + 1}</label>
          <textarea bind:value={sec.content} rows={4} class="{inputCls} resize-none"></textarea>
        </div>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Meilensteine</h3>
      <button onclick={addMilestone} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Hinzufügen</button>
    </div>
    {#each data.milestones as ms, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class={labelCls}>Jahr</label>
            <input type="text" bind:value={ms.year} class={inputCls} placeholder="z.B. 2025" />
          </div>
          <div>
            <label class={labelCls}>Titel</label>
            <input type="text" bind:value={ms.title} class={inputCls} />
          </div>
        </div>
        <div>
          <label class={labelCls}>Beschreibung</label>
          <textarea bind:value={ms.desc} rows={2} class="{inputCls} resize-none"></textarea>
        </div>
        <button onclick={() => removeMilestone(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Was ich nicht mache</h3>
      <button onclick={addNotDoing} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Hinzufügen</button>
    </div>
    {#each data.notDoing as nd, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div>
          <label class={labelCls}>Titel</label>
          <input type="text" bind:value={nd.title} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Text</label>
          <textarea bind:value={nd.text} rows={2} class="{inputCls} resize-none"></textarea>
        </div>
        <button onclick={() => removeNotDoing(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Privates</h3>
    <textarea bind:value={data.privateText} rows={4} class="{inputCls} resize-none"></textarea>
    <p class="text-xs text-muted">Platzhalter <code class="text-gold">{'{city}'}</code> wird durch die konfigurierte Stadt ersetzt.</p>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Abschnitt „Warum dieser Name"</h3>
    <p class="text-xs text-muted">Wird nach dem Privat-Abschnitt angezeigt. Leer lassen, um den Abschnitt auszublenden.</p>
    <div>
      <label class={labelCls}>Überschrift</label>
      <input type="text" bind:value={data.warumdieserName.title} class={inputCls} placeholder="Warum dieser Name" />
    </div>
    <div>
      <label class={labelCls}>Text</label>
      <textarea bind:value={data.warumdieserName.text} rows={4} class="{inputCls} resize-none"></textarea>
    </div>
  </div>
</div>
