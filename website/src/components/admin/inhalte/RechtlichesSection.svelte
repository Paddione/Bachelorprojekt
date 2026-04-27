<script lang="ts">
  let { initialData }: { initialData: Record<string, string> } = $props();

  let data = $state(structuredClone(initialData));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/rechtliches/save', {
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

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50 font-mono';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Rechtliches</h2>
      <p class="text-muted mt-1 text-sm">Impressum, Datenschutz, AGB, Barrierefreiheit</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Impressum-Zusatz</h3>
    <textarea bind:value={data['impressum-zusatz']} rows={5} class={inputCls}></textarea>
  </div>
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Datenschutzerklärung</h3>
    <textarea bind:value={data['datenschutz']} rows={20} class={inputCls}></textarea>
  </div>
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">AGB</h3>
    <textarea bind:value={data['agb']} rows={20} class={inputCls}></textarea>
  </div>
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Barrierefreiheit</h3>
    <textarea bind:value={data['barrierefreiheit']} rows={15} class={inputCls}></textarea>
  </div>
</div>
