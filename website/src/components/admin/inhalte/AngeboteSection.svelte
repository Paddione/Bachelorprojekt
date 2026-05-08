<script lang="ts">
  import type { ServiceOverride, LeistungCategoryOverride } from '../../../lib/website-db';

  let { initialServices, initialLeistungen, initialPriceListUrl, staticSlugs }: {
    initialServices: ServiceOverride[];
    initialLeistungen: LeistungCategoryOverride[];
    initialPriceListUrl: string;
    staticSlugs: string[];
  } = $props();

  const staticSlugSet = new Set(staticSlugs);

  let services = $state(JSON.parse(JSON.stringify(initialServices)));
  let leistungen = $state(JSON.parse(JSON.stringify(initialLeistungen)));
  let priceListUrl = $state(initialPriceListUrl);
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  function slugify(s: string): string {
    return (s ?? '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function uniqueSlug(base: string): string {
    const used = new Set(services.map((s: ServiceOverride) => s.slug));
    if (!used.has(base) && base) return base || `karte-${services.length + 1}`;
    let n = 2;
    while (used.has(`${base}-${n}`)) n++;
    return base ? `${base}-${n}` : `karte-${services.length + 1}`;
  }

  function addService() {
    const slug = uniqueSlug(slugify('neue Leistungskarte'));
    services = [
      ...services,
      {
        slug,
        title: 'Neue Leistungskarte',
        description: '',
        icon: '✨',
        price: '',
        features: [],
        meta: '',
        hidden: false,
        pageContent: { headline: '', intro: '', forWhom: [], sections: [], pricing: [], faq: [] },
      } satisfies ServiceOverride,
    ];
  }

  function removeService(idx: number) {
    if (!confirm(`Leistungskarte „${services[idx].title}" entfernen? Das kann nicht rückgängig gemacht werden.`)) return;
    services = services.filter((_: ServiceOverride, i: number) => i !== idx);
  }

  async function save() {
    saving = true; msg = '';
    // Reslug entries whose slug is empty (e.g. user cleared it) using the title.
    services = services.map((s: ServiceOverride) => ({
      ...s,
      slug: s.slug?.trim() || uniqueSlug(slugify(s.title)),
    }));
    try {
      const res = await fetch('/api/admin/angebote/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services, leistungen, priceListUrl }),
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
  const moveBtnCls = 'px-2 py-1 rounded-md border border-dark-lighter text-muted hover:text-light hover:border-gold/50 disabled:opacity-30 disabled:cursor-not-allowed text-sm';

  function moveService(idx: number, delta: number) {
    const next = idx + delta;
    if (next < 0 || next >= services.length) return;
    const arr = services;
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    services = [...arr];
  }

  function ensurePageContent(svc: ServiceOverride) {
    if (!svc.pageContent) svc.pageContent = {};
    if (!svc.pageContent.sections) svc.pageContent.sections = [];
    if (!svc.pageContent.pricing) svc.pageContent.pricing = [];
    return svc.pageContent;
  }

  function addSection(svc: ServiceOverride) {
    const pc = ensurePageContent(svc);
    pc.sections = [...(pc.sections ?? []), { title: 'Neuer Bereich', items: [] }];
    services = [...services];
  }
  function removeSection(svc: ServiceOverride, sIdx: number) {
    if (!svc.pageContent?.sections) return;
    svc.pageContent.sections = svc.pageContent.sections.filter((_, i) => i !== sIdx);
    services = [...services];
  }
  function moveSection(svc: ServiceOverride, sIdx: number, delta: number) {
    const arr = svc.pageContent?.sections;
    if (!arr) return;
    const next = sIdx + delta;
    if (next < 0 || next >= arr.length) return;
    [arr[sIdx], arr[next]] = [arr[next], arr[sIdx]];
    services = [...services];
  }

  function addPricing(svc: ServiceOverride) {
    const pc = ensurePageContent(svc);
    pc.pricing = [...(pc.pricing ?? []), { label: 'Neuer Tarif', price: '0 €' }];
    services = [...services];
  }
  function removePricing(svc: ServiceOverride, pIdx: number) {
    if (!svc.pageContent?.pricing) return;
    svc.pageContent.pricing = svc.pageContent.pricing.filter((_, i) => i !== pIdx);
    services = [...services];
  }
  function movePricing(svc: ServiceOverride, pIdx: number, delta: number) {
    const arr = svc.pageContent?.pricing;
    if (!arr) return;
    const next = pIdx + delta;
    if (next < 0 || next >= arr.length) return;
    [arr[pIdx], arr[next]] = [arr[next], arr[pIdx]];
    services = [...services];
  }

  function moveLeistungService(cat: LeistungCategoryOverride, sIdx: number, delta: number) {
    const arr = cat.services ?? [];
    const next = sIdx + delta;
    if (next < 0 || next >= arr.length) return;
    [arr[sIdx], arr[next]] = [arr[next], arr[sIdx]];
    leistungen = [...leistungen];
  }
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Angebote</h2>
      <p class="text-muted mt-1 text-sm">Leistungskarten, Leistungskatalog und Preisliste</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Services -->
  <div class={sectionCls}>
    <div class="flex items-center justify-between">
      <h3 class="text-xl font-bold text-light font-serif">Leistungskarten</h3>
      <button type="button" onclick={addService} class="px-3 py-1.5 text-sm rounded-md border border-gold/40 text-gold hover:bg-gold/10">+ Leistungskarte</button>
    </div>
    <p class="text-xs text-muted -mt-2">Reihenfolge mit den Pfeilen ändern. Diese Reihenfolge bestimmt, wie die Karten auf der Startseite und im Footer erscheinen.</p>
    {#each services as svc, idx (svc.slug)}
      {@const isCustom = !staticSlugSet.has(svc.slug)}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-3">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1" role="group" aria-label="Reihenfolge ändern">
            <button type="button" onclick={() => moveService(idx, -1)} disabled={idx === 0} class={moveBtnCls} title="Nach oben" aria-label="Nach oben">↑</button>
            <button type="button" onclick={() => moveService(idx, 1)} disabled={idx === services.length - 1} class={moveBtnCls} title="Nach unten" aria-label="Nach unten">↓</button>
          </div>
          <span class="text-xs text-muted">#{idx + 1}</span>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={svc.hidden} class="accent-gold" />
            <span class="text-xs text-muted">Ausblenden</span>
          </label>
          {#if isCustom}
            <input type="text" bind:value={svc.slug} class="px-2 py-1 bg-dark-lighter border border-dark-lighter rounded text-xs font-mono text-muted focus:outline-none focus:border-gold/50 max-w-[180px]" placeholder="slug" aria-label="Slug (URL-Pfad)" />
            <button type="button" onclick={() => removeService(idx)} class="ml-auto px-2 py-1 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10">Entfernen</button>
          {:else}
            <span class="text-xs font-mono text-muted">{svc.slug}</span>
          {/if}
        </div>
        {#if isCustom}
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class={labelCls}>Icon (Emoji oder kurzes Symbol)</label>
              <input type="text" bind:value={svc.icon} class={inputCls} placeholder="z. B. 🎯 oder ✨" />
            </div>
            <div>
              <label class={labelCls}>Eyebrow-Label (kleine Beschriftung über dem Titel)</label>
              <input type="text" bind:value={svc.meta} class={inputCls} placeholder="z. B. Mensch · Rolle · Haltung" />
            </div>
          </div>
        {/if}
        <div class="grid grid-cols-2 gap-4">
          <div><label class={labelCls}>Titel</label><input type="text" bind:value={svc.title} class={inputCls} /></div>
          <div><label class={labelCls}>Preis</label><input type="text" bind:value={svc.price} class={inputCls} /></div>
        </div>
        <div><label class={labelCls}>Beschreibung</label><textarea bind:value={svc.description} rows={2} class="{inputCls} resize-none"></textarea></div>
        <div>
          <label class={labelCls}>Features (eine pro Zeile)</label>
          <textarea
            value={svc.features.join('\n')}
            oninput={(e) => { svc.features = (e.currentTarget as HTMLTextAreaElement).value.split('\n').map(f => f.trim()).filter(Boolean); }}
            rows={4} class="{inputCls} resize-none font-mono"
          ></textarea>
        </div>
        <details class="text-xs text-muted">
          <summary class="cursor-pointer hover:text-light">Seiteninhalte (pageContent)</summary>
          <div class="mt-3 space-y-4">
            <div><label class={labelCls}>Überschrift</label><input type="text" bind:value={svc.pageContent!.headline} class={inputCls} /></div>
            <div><label class={labelCls}>Intro</label><textarea bind:value={svc.pageContent!.intro} rows={3} class="{inputCls} resize-none"></textarea></div>
            <div>
              <label class={labelCls}>Für wen (eine pro Zeile)</label>
              <textarea
                value={(svc.pageContent!.forWhom ?? []).join('\n')}
                oninput={(e) => { if (!svc.pageContent) svc.pageContent = {}; svc.pageContent.forWhom = (e.currentTarget as HTMLTextAreaElement).value.split('\n').map(f => f.trim()).filter(Boolean); }}
                rows={4} class="{inputCls} resize-none font-mono"
              ></textarea>
            </div>

            <!-- Leistungsumfang (sections) -->
            <div class="border-t border-dark-lighter pt-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-light">Leistungsumfang (Spalten/Bereiche)</span>
                <button type="button" onclick={() => addSection(svc)} class="px-2 py-1 text-xs rounded-md border border-gold/40 text-gold hover:bg-gold/10">+ Bereich</button>
              </div>
              {#each (svc.pageContent?.sections ?? []) as sec, sIdx}
                <div class="p-3 bg-dark-lighter/30 rounded-lg space-y-2 mb-2">
                  <div class="flex items-center gap-2">
                    <button type="button" onclick={() => moveSection(svc, sIdx, -1)} disabled={sIdx === 0} class={moveBtnCls} aria-label="Bereich nach oben">↑</button>
                    <button type="button" onclick={() => moveSection(svc, sIdx, 1)} disabled={sIdx === (svc.pageContent?.sections?.length ?? 0) - 1} class={moveBtnCls} aria-label="Bereich nach unten">↓</button>
                    <input type="text" bind:value={sec.title} class={inputCls} placeholder="Titel des Bereichs" />
                    <button type="button" onclick={() => removeSection(svc, sIdx)} class="px-2 py-1 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10">Entfernen</button>
                  </div>
                  <textarea
                    value={(sec.items ?? []).join('\n')}
                    oninput={(e) => { sec.items = (e.currentTarget as HTMLTextAreaElement).value.split('\n').map(f => f.trim()).filter(Boolean); services = [...services]; }}
                    rows={4} class="{inputCls} resize-none font-mono" placeholder="Ein Bullet pro Zeile"
                  ></textarea>
                </div>
              {/each}
            </div>

            <!-- Investition (pricing) -->
            <div class="border-t border-dark-lighter pt-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-light">Investition (Preis-Boxen)</span>
                <button type="button" onclick={() => addPricing(svc)} class="px-2 py-1 text-xs rounded-md border border-gold/40 text-gold hover:bg-gold/10">+ Preis</button>
              </div>
              <p class="text-xs text-muted mb-2">Werden auf der Detailseite des Angebots als 'Investition'-Boxen angezeigt. 'Hervorheben' markiert die Box mit Goldrand.</p>
              {#each (svc.pageContent?.pricing ?? []) as p, pIdx}
                <div class="p-3 bg-dark-lighter/30 rounded-lg space-y-2 mb-2">
                  <div class="flex items-center gap-2">
                    <button type="button" onclick={() => movePricing(svc, pIdx, -1)} disabled={pIdx === 0} class={moveBtnCls} aria-label="Preis nach oben">↑</button>
                    <button type="button" onclick={() => movePricing(svc, pIdx, 1)} disabled={pIdx === (svc.pageContent?.pricing?.length ?? 0) - 1} class={moveBtnCls} aria-label="Preis nach unten">↓</button>
                    <span class="text-xs text-muted">#{pIdx + 1}</span>
                    <button type="button" onclick={() => removePricing(svc, pIdx)} class="ml-auto px-2 py-1 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10">Entfernen</button>
                  </div>
                  <div class="grid grid-cols-3 gap-2">
                    <div><label class={labelCls}>Bezeichnung</label><input type="text" bind:value={p.label} class={inputCls} /></div>
                    <div><label class={labelCls}>Preis</label><input type="text" bind:value={p.price} class={inputCls} /></div>
                    <div><label class={labelCls}>Einheit / Hinweis</label><input type="text" bind:value={p.unit} class={inputCls} /></div>
                  </div>
                  <label class="flex items-center gap-2 cursor-pointer text-xs text-muted">
                    <input type="checkbox" bind:checked={p.highlight} class="accent-gold" />
                    <span>Hervorheben (Goldrand)</span>
                  </label>
                </div>
              {/each}
            </div>
          </div>
        </details>
      </div>
    {/each}
  </div>

  <!-- Price list URL -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Preisliste</h3>
    <div><label class={labelCls}>Nextcloud-Freigabe-URL</label><input type="url" bind:value={priceListUrl} class={inputCls} placeholder="https://files.mentolder.de/s/..." /></div>
  </div>

  <!-- Leistungskatalog -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Leistungskatalog</h3>
    {#each leistungen as cat}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-3">
        <div class="grid grid-cols-2 gap-4">
          <div><label class={labelCls}>Kategorie-Titel</label><input type="text" bind:value={cat.title} class={inputCls} /></div>
          <div><label class={labelCls}>Icon</label><input type="text" bind:value={cat.icon} class={inputCls} /></div>
        </div>
        {#each (cat.services ?? []) as svc, sIdx}
          <div class="p-3 bg-dark-lighter/30 rounded-lg space-y-2">
            <div class="flex items-center gap-2">
              <button type="button" onclick={() => moveLeistungService(cat, sIdx, -1)} disabled={sIdx === 0} class={moveBtnCls} aria-label="Nach oben">↑</button>
              <button type="button" onclick={() => moveLeistungService(cat, sIdx, 1)} disabled={sIdx === (cat.services?.length ?? 0) - 1} class={moveBtnCls} aria-label="Nach unten">↓</button>
              <p class="text-xs font-mono text-muted">{svc.key}</p>
              <label class="ml-auto flex items-center gap-2 cursor-pointer text-xs text-muted">
                <input type="checkbox" bind:checked={svc.highlight} class="accent-gold" />
                <span>Hervorheben</span>
              </label>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div><label class={labelCls}>Name</label><input type="text" bind:value={svc.name} class={inputCls} /></div>
              <div><label class={labelCls}>Preis</label><input type="text" bind:value={svc.price} class={inputCls} /></div>
              <div><label class={labelCls}>Einheit</label><input type="text" bind:value={svc.unit} class={inputCls} /></div>
            </div>
            <div><label class={labelCls}>Beschreibung</label><textarea bind:value={svc.desc} rows={2} class="{inputCls} resize-none"></textarea></div>
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>
