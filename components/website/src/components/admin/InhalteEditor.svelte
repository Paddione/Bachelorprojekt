<script lang="ts">
  import NewsletterAdmin from './NewsletterAdmin.svelte';
  import QuestionnaireTemplateEditor from './QuestionnaireTemplateEditor.svelte';
  import VertragsvorlagenSection from './inhalte/VertragsvorlagenSection.svelte';
  import RechnungsvorlagenSection from './inhalte/RechnungsvorlagenSection.svelte';
  import SeoEditor from './SeoEditor.svelte';
  import StartseiteSection from './inhalte/StartseiteSection.svelte';
  import UebermichSection from './inhalte/UebermichSection.svelte';
  import SchemaEditor from './framework/SchemaEditor.svelte';
  import { schemaFor } from '../../lib/admin/schemas/index';
  import ServicePageSection, { type ServicePageData } from './inhalte/ServicePageSection.svelte';
  import AngeboteSection from './inhalte/AngeboteSection.svelte';
  import FaqSection from './inhalte/FaqSection.svelte';
  import KontaktSection from './inhalte/KontaktSection.svelte';
  import ReferenzenSection from './inhalte/ReferenzenSection.svelte';
  import RechtlichesSection from './inhalte/RechtlichesSection.svelte';
  import CustomSection from './inhalte/CustomSection.svelte';
  import NavigationSection from './inhalte/NavigationSection.svelte';
  import FooterSection from './inhalte/FooterSection.svelte';
  import StammdatenSection from './inhalte/StammdatenSection.svelte';
  import KoreFlagsSection from './inhalte/KoreFlagsSection.svelte';
  import type { HomepageContent, UebermichContent, FaqItem, KontaktContent, ReferenzenConfig, CustomSection as CustomSectionType, ServiceOverride, LeistungCategoryOverride, NavItem, FooterConfig, Stammdaten, KoreFlags } from '../../lib/website-db';
  type InitialData = {
    startseite: HomepageContent; uebermich: UebermichContent;
    coaching: { value: Record<string, unknown> | null; version: number }; fuehrung: { value: Record<string, unknown> | null; version: number };
    '50plus-digital': ServicePageData & { isCatalogLinked?: boolean; catalogTiers?: Array<{ label: string; price: string; unit: string; highlight: boolean }> };
    'ki-transition': ServicePageData & { isCatalogLinked?: boolean; catalogTiers?: Array<{ label: string; price: string; unit: string; highlight: boolean }> };
    beratung: ServicePageData & { isCatalogLinked?: boolean; catalogTiers?: Array<{ label: string; price: string; unit: string; highlight: boolean }> };
    services: ServiceOverride[]; leistungen: LeistungCategoryOverride[];
    priceListUrl: string; faq: FaqItem[]; kontakt: KontaktContent;
    referenzen: ReferenzenConfig; rechtliches: Record<string, string>;
    rechtlichesHasCustom: Record<string, boolean>;
    customSections: CustomSectionType[];
    navigation: NavItem[]; footer: FooterConfig;
    stammdaten: Stammdaten; koreFlags: KoreFlags;
  };
  type RechnungsvorlagenData = { invoice_intro_text: string; invoice_kleinunternehmer_notice: string; invoice_outro_text: string; invoice_email_subject: string; invoice_email_body: string; };
  type PrimaryTab = 'website' | 'newsletter' | 'fragebogen' | 'vertraege' | 'rechnungen';

  let { initialData, rechnungsvorlagen, brand = 'mentolder', staticServiceSlugs = [] }: {
    initialData: InitialData; rechnungsvorlagen: RechnungsvorlagenData;
    brand?: string; staticServiceSlugs?: string[];
  } = $props();

  function readParam<T extends string>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    return (new URLSearchParams(window.location.search).get(key) as T) ?? fallback;
  }

  let activeTab = $state<PrimaryTab>(readParam('tab', 'website') as PrimaryTab);
  let activeSection = $state<string>(readParam('section', 'startseite'));
  let customSections = $state(initialData.customSections);
  let showNewDialog = $state(false);
  let newTitle = $state('');
  let newSlug = $state('');
  let newFields = $state<Array<{ name: string; label: string; type: 'text' | 'textarea' | 'url'; required: boolean }>>(
    [
      { name: 'headline', label: 'Überschrift', type: 'text', required: true },
      { name: 'content', label: 'Inhalt', type: 'textarea', required: false },
    ]
  );
  let newSaving = $state(false); let newMsg = $state('');
  let sectionSearch = $state('');

  $effect(() => {
    const params = new URLSearchParams();
    params.set('tab', activeTab);
    if (activeTab === 'website') params.set('section', activeSection);
    history.replaceState(null, '', `?${params.toString()}`);
  });

  function switchTab(tab: PrimaryTab) { activeTab = tab; if (tab === 'website' && !activeSection) activeSection = 'startseite'; }

  function addField() { newFields = [...newFields, { name: '', label: '', type: 'text', required: false }]; }
  function removeField(i: number) { newFields = newFields.filter((_, idx) => idx !== i); }

  function resetDialog() {
    showNewDialog = false; newTitle = ''; newSlug = ''; newMsg = '';
    newFields = [
      { name: 'headline', label: 'Überschrift', type: 'text', required: true },
      { name: 'content', label: 'Inhalt', type: 'textarea', required: false },
    ];
  }

  async function createSection() {
    if (!newTitle.trim() || !newSlug.trim()) { newMsg = 'Titel und Slug erforderlich.'; return; }
    newSaving = true; newMsg = '';
    try {
      const res = await fetch('/api/admin/inhalte/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), slug: newSlug.trim(), fields: newFields }),
      });
      const data = await res.json();
      if (res.ok) { customSections = [...customSections, data]; resetDialog(); activeSection = data.slug; }
      else { newMsg = data.error ?? 'Fehler.'; }
    } catch { newMsg = 'Verbindungsfehler.'; } finally { newSaving = false; }
  }

  function onCustomDeleted(slug: string) { customSections = customSections.filter(s => s.slug !== slug); activeSection = 'startseite'; }

  function slugify(s: string) {
    return s.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
  }
  $effect(() => { if (newTitle && !newSlug) newSlug = slugify(newTitle); });

  const SECTION_LABELS: Record<string, string> = {
    seo: 'SEO', startseite: 'Startseite', uebermich: 'Über mich',
    coaching: 'Coaching', 'fuehrung-persoenlichkeit': 'Führung & Pers.',
    '50plus-digital': '50+ digital', 'ki-transition': 'KI-Transition', beratung: 'Beratung',
    angebote: 'Angebote', faq: 'FAQ', kontakt: 'Kontakt',
    referenzen: 'Referenzen', rechtliches: 'Rechtliches',
    stammdaten: 'Stammdaten', navigation: 'Navigation', footer: 'Footer',
    // Kore-Flags only apply to the korczewski brand homepage.
    ...(brand === 'korczewski' ? { 'kore-flags': 'Kore-Flags' } : {}),
  };

  const filteredSections = $derived.by(() => {
    const q = sectionSearch.trim().toLowerCase();
    const staticEntries = Object.entries(SECTION_LABELS).filter(([, label]) =>
      !q || label.toLowerCase().includes(q)
    );
    const customEntries = customSections.filter(cs =>
      !q || cs.title.toLowerCase().includes(q)
    );
    return { staticEntries, customEntries };
  });

  function onSectionSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      const { staticEntries, customEntries } = filteredSections;
      if (staticEntries.length > 0) {
        activeSection = staticEntries[0][0];
      } else if (customEntries.length > 0) {
        activeSection = customEntries[0].slug;
      }
      sectionSearch = '';
    }
  }

  const STANDARD_FIELD_TYPES = [
    { value: 'text', label: 'Einzeiliger Text' },
    { value: 'textarea', label: 'Mehrzeiliger Text' },
    { value: 'url', label: 'URL / Link' },
  ];

  const tabBtnCls = (a: boolean) => `px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${a ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-light'}`;
</script>

<div class="flex flex-col h-full">
  <div class="flex gap-0 border-b border-dark-lighter overflow-x-auto flex-shrink-0">
    <button onclick={() => switchTab('website')} class={tabBtnCls(activeTab==='website')}>🌐 Website</button>
    <button onclick={() => switchTab('newsletter')} class={tabBtnCls(activeTab==='newsletter')}>✉️ Newsletter</button>
    <button onclick={() => switchTab('fragebogen')} class={tabBtnCls(activeTab==='fragebogen')}>📋 Fragebögen</button>
    <button onclick={() => switchTab('vertraege')} class={tabBtnCls(activeTab==='vertraege')}>📄 Verträge</button>
    <button onclick={() => switchTab('rechnungen')} class={tabBtnCls(activeTab==='rechnungen')}>🧾 Rechnungen</button>
  </div>

  {#if activeTab === 'website'}
    <div class="flex flex-1 overflow-hidden">
      <!-- Left sidebar -->
      <div class="w-[180px] flex-shrink-0 border-r border-dark-lighter/40 flex flex-col bg-dark/10">
        <div class="px-2 py-2">
          <input
            type="search"
            bind:value={sectionSearch}
            onkeydown={onSectionSearchKeydown}
            placeholder="Suchen…"
            class="w-full px-2 py-1 text-xs rounded bg-dark border border-dark-lighter text-light placeholder:text-muted focus:outline-none focus:border-gold/60"
          />
        </div>
        <div class="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {#each filteredSections.staticEntries as [sec, label]}
            <button
              onclick={() => activeSection = sec}
              class={`w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors ${activeSection === sec ? 'bg-gold/15 text-gold font-semibold' : 'text-muted hover:text-light hover:bg-dark-lighter/40'}`}
            >{label}</button>
          {/each}
          {#each filteredSections.customEntries as cs}
            <button
              onclick={() => activeSection = cs.slug}
              class={`w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors ${activeSection === cs.slug ? 'bg-gold/15 text-gold font-semibold' : 'text-muted hover:text-light hover:bg-dark-lighter/40'}`}
            >{cs.title} ★</button>
          {/each}
        </div>
        <div class="px-2 py-2 border-t border-dark-lighter/40">
          <button onclick={() => showNewDialog = true}
            class="w-full px-2.5 py-1.5 text-xs bg-gold text-dark font-semibold rounded-md hover:bg-gold/80 text-center">
            + Abschnitt
          </button>
        </div>
      </div>
      <!-- Right: content -->
      <div class="flex-1 overflow-y-auto px-8 pt-6 pb-20">
        {#if activeSection === 'seo'}<SeoEditor />
        {:else if activeSection === 'startseite'}<StartseiteSection initialData={initialData.startseite} />
        {:else if activeSection === 'uebermich'}<UebermichSection initialData={initialData.uebermich} />
        {:else if activeSection === 'coaching'}<SchemaEditor schema={schemaFor('service:coaching')!} initialValue={initialData.coaching?.value ?? null} initialVersion={initialData.coaching?.version ?? 0} />
        {:else if activeSection === 'fuehrung-persoenlichkeit'}<SchemaEditor schema={schemaFor('service:fuehrung-persoenlichkeit')!} initialValue={initialData.fuehrung?.value ?? null} initialVersion={initialData.fuehrung?.version ?? 0} />
        {:else if activeSection === '50plus-digital'}
          <ServicePageSection initialData={initialData['50plus-digital']} slug="50plus-digital" pageLabel="50+ digital"
            isCatalogLinked={initialData['50plus-digital']?.isCatalogLinked}
            catalogTiers={initialData['50plus-digital']?.catalogTiers ?? []} />
        {:else if activeSection === 'ki-transition'}
          <ServicePageSection initialData={initialData['ki-transition']} slug="ki-transition" pageLabel="KI-Transition Coaching"
            isCatalogLinked={initialData['ki-transition']?.isCatalogLinked}
            catalogTiers={initialData['ki-transition']?.catalogTiers ?? []} />
        {:else if activeSection === 'beratung'}
          <ServicePageSection initialData={initialData.beratung} slug="beratung" pageLabel="Unternehmensberatung"
            isCatalogLinked={initialData.beratung?.isCatalogLinked}
            catalogTiers={initialData.beratung?.catalogTiers ?? []} />
        {:else if activeSection === 'angebote'}
          <AngeboteSection initialServices={initialData.services} initialLeistungen={initialData.leistungen} initialPriceListUrl={initialData.priceListUrl} staticSlugs={staticServiceSlugs} />
        {:else if activeSection === 'faq'}<FaqSection initialData={initialData.faq} />
        {:else if activeSection === 'kontakt'}<KontaktSection initialData={initialData.kontakt} />
        {:else if activeSection === 'referenzen'}<ReferenzenSection initialData={initialData.referenzen} />
        {:else if activeSection === 'rechtliches'}
          <RechtlichesSection initialData={initialData.rechtliches} rechtlichesHasCustom={initialData.rechtlichesHasCustom} />
        {:else if activeSection === 'stammdaten'}<StammdatenSection initialData={initialData.stammdaten} />
        {:else if activeSection === 'navigation'}<NavigationSection initialData={initialData.navigation} />
        {:else if activeSection === 'footer'}<FooterSection initialData={initialData.footer} />
        {:else if activeSection === 'kore-flags' && brand === 'korczewski'}<KoreFlagsSection initialData={initialData.koreFlags} />
        {:else}
          {@const cs = customSections.find(s => s.slug === activeSection)}
          {#if cs}<CustomSection section={cs} onDeleted={() => onCustomDeleted(cs.slug)} />{/if}
        {/if}
      </div>
    </div>
  {:else if activeTab === 'newsletter'}
    <div class="max-w-4xl px-8 pt-6 pb-20"><NewsletterAdmin /></div>
  {:else if activeTab === 'fragebogen'}
    <div class="max-w-4xl px-8 pt-6 pb-20">
      <QuestionnaireTemplateEditor />
      <div class="mt-8 pt-6 border-t border-dark-lighter/60">
        <p class="text-xs text-muted mb-2 font-mono uppercase tracking-widest">Druckvorlage</p>
        <a href="/brand/{brand}/starters/questionnaire.html" target="_blank" rel="noopener"
          class="inline-flex items-center gap-2 text-sm text-muted hover:text-gold transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
            <path d="M17 17H17.01M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 8v6m-3-3h6"/>
          </svg>
          Branded Druckvorlage öffnen &amp; drucken
        </a>
      </div>
    </div>
  {:else if activeTab === 'vertraege'}<div class="max-w-4xl px-8 pt-6 pb-20"><VertragsvorlagenSection /></div>
  {:else if activeTab === 'rechnungen'}<div class="max-w-4xl px-8 pt-6 pb-20"><RechnungsvorlagenSection initialData={rechnungsvorlagen} /></div>
  {/if}
</div>

{#if showNewDialog}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-lg space-y-5">
      <div>
        <h3 class="text-lg font-bold text-light font-serif">Neuer Website-Abschnitt</h3>
        <p class="text-xs text-muted mt-1">Erstelle einen benutzerdefinierten Abschnitt mit eigenen Feldern.</p>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-muted mb-1">Titel *</label>
          <input type="text" bind:value={newTitle} placeholder="z.B. Meine Zertifikate"
            class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50" />
        </div>
        <div>
          <label class="block text-xs text-muted mb-1">Slug (URL-Pfad) *</label>
          <input type="text" bind:value={newSlug} placeholder="z.B. zertifikate"
            class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm font-mono focus:outline-none focus:border-gold/50" />
          <p class="text-xs text-muted mt-1">Wird automatisch aus dem Titel abgeleitet.</p>
        </div>
      </div>
      <div>
        <div class="flex justify-between items-center mb-3">
          <div>
            <p class="text-sm font-semibold text-light">Felder</p>
            <p class="text-xs text-muted">Standard-Felder sind bereits vorbereitet.</p>
          </div>
          <button onclick={addField} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Feld</button>
        </div>
        <div class="space-y-2">
          {#each newFields as field, i}
            <div class="p-3 bg-dark rounded-lg border border-dark-lighter space-y-2">
              <div class="flex gap-2 items-center">
                <div class="flex-1">
                  <label class="block text-xs text-muted mb-1">Interner Name</label>
                  <input type="text" bind:value={field.name} placeholder="z.B. headline"
                    class="w-full px-2 py-1.5 bg-dark-lighter border border-dark-lighter rounded text-light text-xs font-mono focus:outline-none focus:border-gold/50" />
                </div>
                <div class="flex-1">
                  <label class="block text-xs text-muted mb-1">Angezeigter Name</label>
                  <input type="text" bind:value={field.label} placeholder="z.B. Überschrift"
                    class="w-full px-2 py-1.5 bg-dark-lighter border border-dark-lighter rounded text-light text-xs focus:outline-none focus:border-gold/50" />
                </div>
                <div>
                  <label class="block text-xs text-muted mb-1">Typ</label>
                  <select bind:value={field.type} class="px-2 py-1.5 bg-dark-lighter border border-dark-lighter rounded text-light text-xs">
                    {#each STANDARD_FIELD_TYPES as ft}<option value={ft.value}>{ft.label}</option>{/each}
                  </select>
                </div>
                <div class="pt-4">
                  <label class="flex items-center gap-1 text-xs text-muted cursor-pointer">
                    <input type="checkbox" bind:checked={field.required} class="accent-gold" /> Pflicht
                  </label>
                </div>
                <button onclick={() => removeField(i)} class="text-red-400 text-xs hover:text-red-300 pt-4">✕</button>
              </div>
            </div>
          {/each}
        </div>
      </div>
      {#if newMsg}<p class="text-red-400 text-sm">{newMsg}</p>{/if}
      <div class="flex gap-3 justify-end">
        <button onclick={resetDialog} class="px-4 py-2 text-muted text-sm hover:text-light">Abbrechen</button>
        <button onclick={createSection} disabled={newSaving}
          class="px-4 py-2 bg-gold text-dark font-semibold rounded-lg text-sm hover:bg-gold/80 disabled:opacity-50">
          {newSaving ? 'Erstelle…' : 'Abschnitt erstellen'}
        </button>
      </div>
    </div>
  </div>
{/if}
