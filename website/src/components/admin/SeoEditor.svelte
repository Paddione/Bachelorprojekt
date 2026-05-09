<script lang="ts">
  type PageDef = { key: string; label: string; fallbackDesc: string; fallbackTitle?: string };

  const PAGES: PageDef[] = [
    {
      key: 'home',
      label: 'Startseite',
      fallbackTitle: 'Gerald Korczewski – Coach & Mentor',
      fallbackDesc: 'Coaching & digitale Begleitung in Lüneburg und Hamburg – persönlich, erfahren, auf Augenhöhe. Für Führungspersönlichkeiten und Menschen in Veränderung.',
    },
    {
      key: 'kontakt',
      label: 'Kontakt',
      fallbackDesc: 'Nehmen Sie Kontakt auf – kostenloses Erstgespräch, kein Verkaufsdruck.',
    },
    {
      key: 'ueber-mich',
      label: 'Über mich',
      fallbackTitle: 'Gerald Korczewski – Coach, Mentor & KI-Pionier',
      fallbackDesc: 'Gerald Korczewski: 30+ Jahre Führungserfahrung bei der Polizei Hamburg, systemischer Coach, KI-Pionier. Begleitung für Frauen und Männer in Führung und Veränderung.',
    },
    {
      key: 'leistungen',
      label: 'Angebote',
      fallbackDesc: 'Coaching, digitale Begleitung 50+ und Unternehmensberatung – Angebote von Gerald Korczewski.',
    },
    {
      key: 'coaching',
      label: '/coaching',
      fallbackTitle: 'Coaching für Führungskräfte & Menschen in Verantwortung',
      fallbackDesc: 'Karriere-Coaching für Führungskräfte in Lüneburg und Hamburg. Profil schärfen, Strategie entwickeln, Gespräche vorbereiten – auf Augenhöhe mit 40+ Jahren Erfahrung.',
    },
    {
      key: '50plus-digital',
      label: '/50plus-digital',
      fallbackTitle: '50+ digital – Digitale Begleitung in Lüneburg & Hamburg',
      fallbackDesc: 'Digitale Begleitung für Menschen 50+ in Lüneburg und Hamburg. Smartphone, WhatsApp, Online-Banking – Schritt für Schritt, ohne Fachchinesisch, in Ihrem Tempo.',
    },
    {
      key: 'beratung',
      label: '/beratung',
      fallbackTitle: 'Digitale Transformation & KI-Beratung für Mittelstand',
      fallbackDesc: 'Digitale Transformation & KI-Strategie für Mittelstand, Verwaltung und kritische Infrastrukturen – mit 40 Jahren Praxis aus komplexen Strukturen. Lüneburg & Hamburg.',
    },
    {
      key: 'ki-transition',
      label: '/ki-transition',
      fallbackTitle: 'KI-Transition Coaching – Orientierung im digitalen Wandel',
      fallbackDesc: 'KI verändert Berufsbilder – ich begleite Sie dabei. Für IT-Fachkräfte, Führungspersönlichkeiten und Unternehmen in Lüneburg, Hamburg und online.',
    },
  ];

  // values[pageKey] = { desc, title }
  let values = $state<Record<string, { desc: string; title: string }>>({});
  let savingKey = $state<string | null>(null);
  let messages = $state<Record<string, { text: string; ok: boolean }>>({});
  let loading = $state(true);
  let loadError = $state('');

  async function load() {
    try {
      const res = await fetch('/api/admin/seo');
      if (!res.ok) { loadError = 'Fehler beim Laden.'; return; }
      const data: { descriptions: Record<string, string>; titles: Record<string, string> } = await res.json();
      const initial: Record<string, { desc: string; title: string }> = {};
      for (const p of PAGES) {
        initial[p.key] = {
          desc: data.descriptions?.[p.key] ?? p.fallbackDesc,
          title: data.titles?.[p.key] ?? (p.fallbackTitle ?? ''),
        };
      }
      values = initial;
    } catch {
      loadError = 'Verbindungsfehler.';
    } finally {
      loading = false;
    }
  }

  async function save(pageKey: string) {
    savingKey = pageKey;
    messages = { ...messages, [pageKey]: { text: '', ok: true } };
    try {
      const res = await fetch('/api/admin/seo/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageKey,
          description: values[pageKey]?.desc ?? '',
          title: values[pageKey]?.title ?? '',
        }),
      });
      messages = {
        ...messages,
        [pageKey]: res.ok
          ? { text: 'Gespeichert.', ok: true }
          : { text: 'Fehler beim Speichern.', ok: false },
      };
    } catch {
      messages = { ...messages, [pageKey]: { text: 'Verbindungsfehler.', ok: false } };
    } finally {
      savingKey = null;
    }
  }

  function charClass(len: number): string {
    if (len >= 120 && len <= 160) return 'text-green-400';
    if (len >= 100 && len < 120) return 'text-yellow-400';
    if (len > 160) return 'text-red-400';
    return 'text-yellow-400';
  }

  $effect(() => { load(); });

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50 resize-none';
  const inputLineCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1 font-mono uppercase tracking-widest';
</script>

<div class="pt-8 pb-20 space-y-6 max-w-2xl">
  <div>
    <h2 class="text-lg font-bold text-light font-serif mb-1">SEO & Meta-Beschreibungen</h2>
    <p class="text-sm text-muted">Seitentitel und Beschreibungen für Suchergebnisse. Titel: 50–70 Zeichen, Beschreibung: 120–160 Zeichen.</p>
  </div>

  {#if loading}
    <p class="text-muted text-sm">Lädt…</p>
  {:else if loadError}
    <p class="text-red-400 text-sm">{loadError}</p>
  {:else}
    {#each PAGES as page}
      {@const desc = values[page.key]?.desc ?? ''}
      {@const descLen = desc.length}
      <div class="border border-dark-lighter rounded-xl p-4 space-y-3">
        <p class="text-xs font-mono uppercase tracking-widest text-gold">{page.label}</p>

        {#if page.fallbackTitle !== undefined}
          <div>
            <label class={labelCls}>Seitentitel (title-Tag)</label>
            <input
              type="text"
              class={inputLineCls}
              bind:value={values[page.key].title}
              placeholder={page.fallbackTitle}
            />
          </div>
        {/if}

        <div>
          <label class={labelCls}>Meta-Beschreibung</label>
          <textarea
            rows={3}
            class={inputCls}
            bind:value={values[page.key].desc}
            placeholder={page.fallbackDesc}
          ></textarea>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs {charClass(descLen)} font-mono">
              {descLen} Zeichen
              {#if descLen < 120}(zu kurz — Ziel: 120–160){:else if descLen > 160}(zu lang — Ziel: 120–160){:else}(gut){/if}
            </span>
          </div>
        </div>

        <div class="flex items-center justify-end gap-3">
          {#if messages[page.key]?.text}
            <span class="text-xs {messages[page.key].ok ? 'text-green-400' : 'text-red-400'}">
              {messages[page.key].text}
            </span>
          {/if}
          <button
            onclick={() => save(page.key)}
            disabled={savingKey === page.key}
            class="px-4 py-1.5 bg-gold text-dark text-sm font-semibold rounded-lg hover:bg-gold/80 disabled:opacity-50"
          >
            {savingKey === page.key ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </div>
    {/each}
  {/if}
</div>
