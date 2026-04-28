<script lang="ts">
  import type { HomepageContent } from '../../../lib/website-db';

  let { initialData }: { initialData: HomepageContent } = $props();

  let data = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/startseite/save', {
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

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Startseite</h2>
      <p class="text-muted mt-1 text-sm">Hero, Stats, Warum-ich-Abschnitt und Zitat</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Hero -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Hero-Bereich</h3>
    <div>
      <label class={labelCls}>Kicker-Zeile</label>
      <input type="text" bind:value={data.hero.tagline} class={inputCls} />
    </div>
    <div>
      <label class={labelCls}>Titel</label>
      <textarea bind:value={data.hero.title} rows={2} class="{inputCls} resize-none"></textarea>
    </div>
    <div>
      <label class={labelCls}>Untertitel</label>
      <textarea bind:value={data.hero.subtitle} rows={3} class="{inputCls} resize-none"></textarea>
    </div>
  </div>

  <!-- Stats -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Statistiken</h3>
    {#each data.stats as stat, i}
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class={labelCls}>Wert #{i + 1}</label>
          <input type="text" bind:value={stat.value} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Label #{i + 1}</label>
          <input type="text" bind:value={stat.label} class={inputCls} />
        </div>
      </div>
    {/each}
  </div>

  <!-- Services Section -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Angebote-Sektion</h3>
    <div>
      <label class={labelCls}>Überschrift</label>
      <input type="text" bind:value={data.servicesHeadline} class={inputCls} />
    </div>
    <div>
      <label class={labelCls}>Unterüberschrift</label>
      <textarea bind:value={data.servicesSubheadline} rows={2} class="{inputCls} resize-none"></textarea>
    </div>
  </div>

  <!-- Why Me -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">„Warum ich?"-Abschnitt</h3>
    <div>
      <label class={labelCls}>Überschrift</label>
      <input type="text" bind:value={data.whyMeHeadline} class={inputCls} />
    </div>
    <div>
      <label class={labelCls}>Einleitungstext</label>
      <textarea bind:value={data.whyMeIntro} rows={3} class="{inputCls} resize-none"></textarea>
    </div>
    {#each data.whyMePoints as pt, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div>
          <label class={labelCls}>Titel Punkt {i + 1}</label>
          <input type="text" bind:value={pt.title} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Text Punkt {i + 1}</label>
          <textarea bind:value={pt.text} rows={2} class="{inputCls} resize-none"></textarea>
        </div>
      </div>
    {/each}
  </div>

  <!-- Quote -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Zitat</h3>
    <div>
      <label class={labelCls}>Zitat-Text</label>
      <textarea bind:value={data.quote} rows={2} class="{inputCls} resize-none"></textarea>
    </div>
    <div>
      <label class={labelCls}>Name unter dem Zitat</label>
      <input type="text" bind:value={data.quoteName} class={inputCls} />
    </div>
  </div>
</div>
