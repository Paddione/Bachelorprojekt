<script lang="ts">
  import NewsletterAdmin from './NewsletterAdmin.svelte';
  import QuestionnaireTemplateEditor from './QuestionnaireTemplateEditor.svelte';
  import VertragsvorlagenSection from './inhalte/VertragsvorlagenSection.svelte';
  import RechnungsvorlagenSection from './inhalte/RechnungsvorlagenSection.svelte';
  import SeoEditor from './SeoEditor.svelte';
  import StartseiteSection from './inhalte/StartseiteSection.svelte';
  import UebermichSection from './inhalte/UebermichSection.svelte';
  import CoachingSection from './inhalte/CoachingSection.svelte';
  import FuehrungSection from './inhalte/FuehrungSection.svelte';
  import ServicePageSection from './inhalte/ServicePageSection.svelte';
  import AngeboteSection from './inhalte/AngeboteSection.svelte';
  import FaqSection from './inhalte/FaqSection.svelte';
  import KontaktSection from './inhalte/KontaktSection.svelte';
  import ReferenzenSection from './inhalte/ReferenzenSection.svelte';
  import RechtlichesSection from './inhalte/RechtlichesSection.svelte';
  import CustomSection from './inhalte/CustomSection.svelte';
  import type { HomepageContent, UebermichContent, FaqItem, KontaktContent, ReferenzenConfig, CustomSection as CustomSectionType, ServiceOverride, LeistungCategoryOverride } from '../../lib/website-db';
  import type { CoachingContent } from '../../lib/coaching-content';
  import type { FuehrungContent } from '../../lib/fuehrung-content';

  type InitialData = {
    startseite: HomepageContent; uebermich: UebermichContent;
    coaching: CoachingContent; fuehrung: FuehrungContent;
    '50plus-digital': any; 'ki-transition': any; 'beratung': any;
    services: ServiceOverride[]; leistungen: LeistungCategoryOverride[];
    priceListUrl: string; faq: FaqItem[]; kontakt: KontaktContent;
    referenzen: ReferenzenConfig; rechtliches: Record<string, string>;
    customSections: CustomSectionType[];
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
  let newTitle = $state(''); let newSlug = $state('');
  let newFields = $state<Array<{ name: string; label: string; type: 'text' | 'textarea' | 'url'; required: boolean }>>([]);
  let newSaving = $state(false); let newMsg = $state('');

  $effect(() => {
    const params = new URLSearchParams();
    params.set('tab', activeTab);
    if (activeTab === 'website') params.set('section', activeSection);
    history.replaceState(null, '', `?${params.toString()}`);
  });

  function switchTab(tab: PrimaryTab) { activeTab = tab; if (tab === 'website' && !activeSection) activeSection = 'startseite'; }
  function addField() { newFields = [...newFields, { name: '', label: '', type: 'text', required: false }]; }
  function removeField(i: number) { newFields = newFields.filter((_, idx) => idx !== i); }

  async function createSection() {
    if (!newTitle.trim() || !newSlug.trim()) { newMsg = 'Titel und Slug erforderlich.'; return; }
    newSaving = true; newMsg = '';
    try {
      const res = await fetch('/api/admin/inhalte/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle.trim(), slug: newSlug.trim(), fields: newFields }) });
      const data = await res.json();
      if (res.ok) { customSections = [...customSections, data]; showNewDialog = false; newTitle = ''; newSlug = ''; newFields = []; activeSection = data.slug; }
      else { newMsg = data.error ?? 'Fehler.'; }
    } catch { newMsg = 'Verbindungsfehler.'; } finally { newSaving = false; }
  }

  function onCustomDeleted(slug: string) { customSections = customSections.filter(s => s.slug !== slug); activeSection = 'startseite'; }

  const SECTION_LABELS: Record<string, string> = {
    seo: 'SEO',
    startseite: 'Startseite',
    uebermich: '\u00dcber mich',
    coaching: 'Coaching',
    'fuehrung-persoenlichkeit': 'F\u00fchrung & Pers.',
    '50plus-digital': '50+ digital',
    'ki-transition': 'KI-Transition',
    beratung: 'Beratung',
    angebote: 'Angebote',
    faq: 'FAQ',
    kontakt: 'Kontakt',
    referenzen: 'Referenzen',
    rechtliches: 'Rechtliches',
  };

  const tabBtnCls = (a: boolean) => `px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${a ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-light'}`;
  const secBtnCls = (a: boolean) => `px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${a ? 'border-green-500 text-green-400' : 'border-transparent text-muted hover:text-light'}`;
</script>

<div>
  <div class="flex gap-0 border-b border-dark-lighter overflow-x-auto flex-shrink-0">
    <button onclick={() => switchTab('website')} class={tabBtnCls(activeTab==='website')}>🌐 Website</button>
    <button onclick={() => switchTab('newsletter')} class={tabBtnCls(activeTab==='newsletter')}>✉️ Newsletter</button>
    <button onclick={() => switchTab('fragebogen')} class={tabBtnCls(activeTab==='fragebogen')}>📋 Fragebögen</button>
    <button onclick={() => switchTab('vertraege')} class={tabBtnCls(activeTab==='vertraege')}>📄 Verträge</button>
    <button onclick={() => switchTab('rechnungen')} class={tabBtnCls(activeTab==='rechnungen')}>🧾 Rechnungen</button>
  </div>

  {#if activeTab === 'website'}
    <div class="flex items-center gap-0 border-b border-dark-lighter/60 overflow-x-auto bg-dark/30 flex-shrink-0">
      {#each Object.keys(SECTION_LABELS) as sec}
        <button onclick={() => activeSection = sec} class={secBtnCls(activeSection===sec)}>{SECTION_LABELS[sec]}</button>
      {/each}
      {#each customSections as cs}
        <button onclick={() => activeSection = cs.slug} class={secBtnCls(activeSection===cs.slug)}>{cs.title} ★</button>
      {/each}
      <button onclick={() => showNewDialog = true} class="ml-2 px-3 py-1.5 text-xs text-blue-400 border border-blue-400/30 rounded-md hover:bg-blue-400/10 my-1 flex-shrink-0">+ Abschnitt</button>
    </div>
  {/if}

  <div class="max-w-4xl px-8">
    {#if activeTab === 'website'}
      {#if activeSection === 'seo'}<SeoEditor />
      {:else if activeSection === 'startseite'}<StartseiteSection initialData={initialData.startseite} />
      {:else if activeSection === 'uebermich'}<UebermichSection initialData={initialData.uebermich} />
      {:else if activeSection === 'coaching'}<CoachingSection initialData={initialData.coaching} />
      {:else if activeSection === 'fuehrung-persoenlichkeit'}<FuehrungSection initialData={initialData.fuehrung} />
      {:else if activeSection === '50plus-digital'}
        <ServicePageSection
          initialData={initialData['50plus-digital']}
          slug="50plus-digital"
          pageLabel="50+ digital"
        />
      {:else if activeSection === 'ki-transition'}
        <ServicePageSection
          initialData={initialData['ki-transition']}
          slug="ki-transition"
          pageLabel="KI-Transition Coaching"
        />
      {:else if activeSection === 'beratung'}
        <ServicePageSection
          initialData={initialData.beratung}
          slug="beratung"
          pageLabel="Unternehmensberatung"
        />
      {:else if activeSection === 'angebote'}
        <AngeboteSection
          initialServices={initialData.services}
          initialLeistungen={initialData.leistungen}
          initialPriceListUrl={initialData.priceListUrl}
          staticSlugs={staticServiceSlugs}
        />
      {:else if activeSection === 'faq'}<FaqSection initialData={initialData.faq} />
      {:else if activeSection === 'kontakt'}<KontaktSection initialData={initialData.kontakt} />
      {:else if activeSection === 'referenzen'}<ReferenzenSection initialData={initialData.referenzen} />
      {:else if activeSection === 'rechtliches'}<RechtlichesSection initialData={initialData.rechtliches} />
      {:else}
        {@const cs = customSections.find(s => s.slug === activeSection)}
        {#if cs}<CustomSection section={cs} onDeleted={() => onCustomDeleted(cs.slug)} />{/if}
      {/if}
    {:else if activeTab === 'newsletter'}<div class="pt-6 pb-20"><NewsletterAdmin /></div>
    {:else if activeTab === 'fragebogen'}
      <div class="pt-6 pb-20">
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
    {:else if activeTab === 'vertraege'}<div class="pt-6 pb-20"><VertragsvorlagenSection /></div>
    {:else if activeTab === 'rechnungen'}<div class="pt-6 pb-20"><RechnungsvorlagenSection initialData={rechnungsvorlagen} /></div>
    {/if}
  </div>
</div>

{#if showNewDialog}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-lg space-y-4">
      <h3 class="text-lg font-bold text-light font-serif">Neuer Website-Abschnitt</h3>
      <div><label class="block text-xs text-muted mb-1">Titel *</label><input type="text" bind:value={newTitle} class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50" /></div>
      <div><label class="block text-xs text-muted mb-1">Slug *</label><input type="text" bind:value={newSlug} class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm font-mono focus:outline-none focus:border-gold/50" /></div>
      <div>
        <div class="flex justify-between items-center mb-2"><label class="text-xs text-muted">Felder</label><button onclick={addField} class="text-xs text-blue-400 hover:text-blue-300">+ Feld</button></div>
        {#each newFields as field, i}
          <div class="flex gap-2 mb-2 items-center">
            <input type="text" bind:value={field.name} placeholder="name" class="flex-1 px-2 py-1.5 bg-dark border border-dark-lighter rounded-lg text-light text-xs font-mono" />
            <input type="text" bind:value={field.label} placeholder="Label" class="flex-1 px-2 py-1.5 bg-dark border border-dark-lighter rounded-lg text-light text-xs" />
            <select bind:value={field.type} class="px-2 py-1.5 bg-dark border border-dark-lighter rounded-lg text-light text-xs"><option value="text">text</option><option value="textarea">textarea</option><option value="url">url</option></select>
            <label class="flex items-center gap-1 text-xs text-muted"><input type="checkbox" bind:checked={field.required} class="accent-gold" /> Pflicht</label>
            <button onclick={() => removeField(i)} class="text-red-400 text-xs">✕</button>
          </div>
        {/each}
      </div>
      {#if newMsg}<p class="text-red-400 text-sm">{newMsg}</p>{/if}
      <div class="flex gap-3 justify-end">
        <button onclick={() => { showNewDialog = false; newMsg = ''; }} class="px-4 py-2 text-muted text-sm hover:text-light">Abbrechen</button>
        <button onclick={createSection} disabled={newSaving} class="px-4 py-2 bg-gold text-dark font-semibold rounded-lg text-sm hover:bg-gold/80 disabled:opacity-50">{newSaving ? 'Erstelle…' : 'Erstellen'}</button>
      </div>
    </div>
  </div>
{/if}
