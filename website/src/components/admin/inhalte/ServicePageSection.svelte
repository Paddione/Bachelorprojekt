<!--
  ServicePageSection.svelte
  Universeller Admin-Editor für alle Service-Seiten.
  SEO wird zentral über den SEO-Tab gepflegt – hier nur Hinweis.
  Zentrale Elemente (Header, Footer, Navigation) werden über Kontakt-Tab gepflegt.
-->
<script lang="ts">
  export interface ServiceSection {
    title: string;
    items: string[];
  }

  export interface ServicePricing {
    label: string;
    price: string;
    unit?: string;
    highlight?: boolean;
  }

  export interface ServiceFaq {
    question: string;
    answer: string;
  }

  export interface ServicePageData {
    cardTitle: string;
    cardDescription: string;
    cardPrice: string;
    cardIcon: string;
    cardFeatures: string[];
    headline: string;
    intro: string;
    introNote: string;
    forWhom: string[];
    sections: ServiceSection[];
    pricing: ServicePricing[];
    faq: ServiceFaq[];
    ctaText: string;
    ctaHref: string;
    // SEO wird im SEO-Tab gepflegt, hier nur zur Anzeige
    seoTitle?: string;
    seoDescription?: string;
  }

  let { initialData, slug, pageLabel }: {
    initialData: ServicePageData;
    slug: string;
    pageLabel: string;
  } = $props();

  let data = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch(`/api/admin/service-page/save?slug=${encodeURIComponent(slug)}`, {
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

  function addFeature() { data.cardFeatures = [...data.cardFeatures, '']; }
  function removeFeature(i: number) { data.cardFeatures = data.cardFeatures.filter((_: unknown, idx: number) => idx !== i); }
  function addForWhom() { data.forWhom = [...data.forWhom, '']; }
  function removeForWhom(i: number) { data.forWhom = data.forWhom.filter((_: unknown, idx: number) => idx !== i); }
  function addSection() { data.sections = [...data.sections, { title: '', items: [''] }]; }
  function removeSection(i: number) { data.sections = data.sections.filter((_: unknown, idx: number) => idx !== i); }
  function addSectionItem(si: number) { data.sections[si].items = [...data.sections[si].items, '']; }
  function removeSectionItem(si: number, ii: number) { data.sections[si].items = data.sections[si].items.filter((_: unknown, idx: number) => idx !== ii); }
  function addPricing() { data.pricing = [...data.pricing, { label: '', price: '', unit: '', highlight: false }]; }
  function removePricing(i: number) { data.pricing = data.pricing.filter((_: unknown, idx: number) => idx !== i); }
  function addFaq() { data.faq = [...data.faq, { question: '', answer: '' }]; }
  function removeFaq(i: number) { data.faq = data.faq.filter((_: unknown, idx: number) => idx !== i); }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
  const addBtnCls = 'px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80';
  const removeBtnCls = 'text-xs text-red-400 hover:text-red-300 flex-shrink-0';
</script>

<div class="pt-6 pb-20 space-y-10">
  <!-- Header -->
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">{pageLabel}</h2>
      <p class="text-muted mt-1 text-sm">Inhalte der Seite /{slug} bearbeiten</p>
    </div>
    <button onclick={save} disabled={saving}
      class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${
      msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400'
             : 'bg-red-500/10 border border-red-500/30 text-red-400'
    }`}>{msg}</div>
  {/if}

  <!-- Zentrale Elemente: Hinweis -->
  <div class="p-4 bg-dark-light rounded-xl border border-gold/20 space-y-2">
    <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">Zentral gepflegte Elemente</p>
    <div class="space-y-1 text-sm text-muted">
      <p>🔒 <strong class="text-light">SEO (Seitentitel & Meta-Description)</strong> → <a href="/admin/inhalte?tab=website&section=seo" class="text-gold hover:underline">SEO-Tab</a></p>
      <p>🔒 <strong class="text-light">Header-Navigation & Standort</strong> → automatisch auf allen Seiten</p>
      <p>🔒 <strong class="text-light">Footer (Kontakt, Angebote, Rechtliches, Tagline)</strong> → <a href="/admin/inhalte?tab=website&section=kontakt" class="text-gold hover:underline">Kontakt-Tab</a></p>
    </div>
  </div>

  <!-- Angebote-Karte -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Angebote-Karte (Startseite &amp; Footer-Link)</h3>
    <p class="text-xs text-muted">Titel und Beschreibung erscheinen auf der Startseite und als Footer-Link-Text.</p>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class={labelCls}>Titel (= Footer-Link-Text)</label>
        <input type="text" bind:value={data.cardTitle} class={inputCls} />
      </div>
      <div>
        <label class={labelCls}>Icon (Emoji)</label>
        <input type="text" bind:value={data.cardIcon} class={inputCls} placeholder="z.B. 💻" />
      </div>
    </div>
    <div>
      <label class={labelCls}>Kurzbeschreibung</label>
      <textarea bind:value={data.cardDescription} rows={2} class="{inputCls} resize-none"></textarea>
    </div>
    <div>
      <label class={labelCls}>Preis (auf der Karte)</label>
      <input type="text" bind:value={data.cardPrice} class={inputCls} placeholder="z.B. Ab 60 € / Stunde" />
    </div>
    <div>
      <div class="flex justify-between items-center mb-2">
        <label class={labelCls}>Features (Bullet-Punkte)</label>
        <button onclick={addFeature} class={addBtnCls}>+ Feature</button>
      </div>
      {#each data.cardFeatures as _, i}
        <div class="flex gap-2 items-center mb-2">
          <input type="text" bind:value={data.cardFeatures[i]} class="{inputCls} flex-1" />
          <button onclick={() => removeFeature(i)} class={removeBtnCls}>✕</button>
        </div>
      {/each}
    </div>
  </div>

  <!-- Seiten-Header -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Seiten-Header</h3>
    <div>
      <label class={labelCls}>Hauptüberschrift (H1)</label>
      <input type="text" bind:value={data.headline} class={inputCls} />
    </div>
    <div>
      <label class={labelCls}>Einleitung</label>
      <textarea bind:value={data.intro} rows={4} class="{inputCls} resize-none"></textarea>
    </div>
    {#if data.introNote !== undefined}
      <div>
        <label class={labelCls}>Persönliche Notiz (kursiv, nach Einleitung, vor "Für wen" – optional)</label>
        <textarea bind:value={data.introNote} rows={4} class="{inputCls} resize-none"
          placeholder="Leer lassen wenn nicht benötigt"></textarea>
      </div>
    {/if}
  </div>

  <!-- Für wen -->
  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Für wen ist das?</h3>
      <button onclick={addForWhom} class={addBtnCls}>+ Hinzufügen</button>
    </div>
    <p class="text-xs text-muted">Jeden Punkt einzeln bearbeiten, jederzeit ergänzen oder entfernen.</p>
    {#each data.forWhom as _, i}
      <div class="flex gap-2 items-center">
        <input type="text" bind:value={data.forWhom[i]} class="{inputCls} flex-1" />
        <button onclick={() => removeForWhom(i)} class={removeBtnCls}>✕</button>
      </div>
    {/each}
  </div>

  <!-- Schwerpunkte -->
  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Schwerpunkte</h3>
      <button onclick={addSection} class={addBtnCls}>+ Bereich</button>
    </div>
    {#each data.sections as sec, si}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-3">
        <div class="flex gap-2 items-center">
          <input type="text" bind:value={sec.title} class="{inputCls} flex-1" placeholder="Bereichs-Titel" />
          <button onclick={() => removeSection(si)} class={removeBtnCls}>✕ Bereich</button>
        </div>
        <div class="space-y-2 pl-2">
          {#each sec.items as _, ii}
            <div class="flex gap-2 items-center">
              <input type="text" bind:value={sec.items[ii]} class="{inputCls} flex-1" placeholder="Punkt" />
              <button onclick={() => removeSectionItem(si, ii)} class={removeBtnCls}>✕</button>
            </div>
          {/each}
          <button onclick={() => addSectionItem(si)} class="text-xs text-gold hover:text-gold/80 mt-1">+ Punkt</button>
        </div>
      </div>
    {/each}
  </div>

  <!-- Preise -->
  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Investition</h3>
      <button onclick={addPricing} class={addBtnCls}>+ Preis</button>
    </div>
    {#each data.pricing as p, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div class="grid grid-cols-3 gap-3">
          <div><label class={labelCls}>Bezeichnung</label><input type="text" bind:value={p.label} class={inputCls} /></div>
          <div><label class={labelCls}>Preis</label><input type="text" bind:value={p.price} class={inputCls} /></div>
          <div><label class={labelCls}>Einheit / Hinweis</label><input type="text" bind:value={p.unit} class={inputCls} /></div>
        </div>
        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" bind:checked={p.highlight} class="accent-gold" />
            Hervorheben (Goldrand)
          </label>
          <button onclick={() => removePricing(i)} class={removeBtnCls}>Entfernen</button>
        </div>
      </div>
    {/each}
  </div>

  <!-- CTA -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Call to Action</h3>
    <div><label class={labelCls}>CTA-Text</label><input type="text" bind:value={data.ctaText} class={inputCls} /></div>
    <div><label class={labelCls}>CTA-Link</label><input type="text" bind:value={data.ctaHref} class={inputCls} placeholder="/termin" /></div>
  </div>

  <!-- FAQ -->
  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Häufige Fragen (FAQ)</h3>
      <button onclick={addFaq} class={addBtnCls}>+ Frage</button>
    </div>
    {#each data.faq as item, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div><label class={labelCls}>Frage</label><input type="text" bind:value={item.question} class={inputCls} /></div>
        <div><label class={labelCls}>Antwort</label><textarea bind:value={item.answer} rows={3} class="{inputCls} resize-none"></textarea></div>
        <button onclick={() => removeFaq(i)} class={removeBtnCls}>Entfernen</button>
      </div>
    {/each}
  </div>
</div>
