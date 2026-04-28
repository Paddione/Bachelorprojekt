<script lang="ts">
  import type { KontaktContent } from '../../../lib/website-db';

  let { initialData }: { initialData: KontaktContent } = $props();

  let data = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/kontakt/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Kontakt</h2>
      <p class="text-muted mt-1 text-sm">Kontaktformular-Texte</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Einleitungstext</h3>
    <textarea bind:value={data.intro} rows={3} class="{inputCls} resize-none"></textarea>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Sidebar</h3>
    <div><label class={labelCls}>Titel</label><input type="text" bind:value={data.sidebarTitle} class={inputCls} /></div>
    <div><label class={labelCls}>Text</label><textarea bind:value={data.sidebarText} rows={4} class="{inputCls} resize-none"></textarea></div>
    <div><label class={labelCls}>CTA-Text</label><input type="text" bind:value={data.sidebarCta} class={inputCls} /></div>
    <label class="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" bind:checked={data.showPhone} class="accent-gold" />
      <span class="text-sm text-light">Telefonnummer anzeigen</span>
    </label>
  </div>
</div>
