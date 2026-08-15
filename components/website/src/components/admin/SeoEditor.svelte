<script lang="ts">
  type PageDef = { key: string; label: string; path: string };

  let pages = $state<PageDef[]>([]);
  let values = $state<Record<string, { desc: string; title: string; ogImage: string }>>({});
  let savingKey = $state<string | null>(null);
  let messages = $state<Record<string, { text: string; ok: boolean }>>({});
  let loading = $state(true);
  let loadError = $state('');

  async function load() {
    try {
      const [pagesRes, seoRes] = await Promise.all([
        fetch('/api/admin/seo/pages'),
        fetch('/api/admin/seo'),
      ]);
      if (!pagesRes.ok || !seoRes.ok) { loadError = 'Fehler beim Laden.'; return; }
      const pagesData: { pages: PageDef[] } = await pagesRes.json();
      const seoData: { descriptions: Record<string, string>; titles: Record<string, string>; ogImages: Record<string, string> } = await seoRes.json();
      pages = pagesData.pages;
      const initial: Record<string, { desc: string; title: string; ogImage: string }> = {};
      for (const p of pagesData.pages) {
        initial[p.key] = {
          desc: seoData.descriptions?.[p.key] ?? '',
          title: seoData.titles?.[p.key] ?? '',
          ogImage: seoData.ogImages?.[p.key] ?? '',
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
          ogImage: values[pageKey]?.ogImage ?? '',
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

  async function uploadOgImage(pageKey: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/admin/seo/upload-og-image', { method: 'POST', body: form });
      if (!res.ok) return;
      const data: { src: string } = await res.json();
      values = { ...values, [pageKey]: { ...values[pageKey], ogImage: data.src } };
    } catch { /* ignore */ }
  }

  function removeOgImage(pageKey: string) {
    values = { ...values, [pageKey]: { ...values[pageKey], ogImage: '' } };
  }

  function titleCharClass(len: number): string {
    if (len >= 50 && len <= 70) return 'text-green-400';
    if (len >= 30 && len < 50) return 'text-yellow-400';
    if (len > 70) return 'text-red-400';
    return 'text-yellow-400';
  }

  function descCharClass(len: number): string {
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
    <p class="text-xs text-muted mt-1">Gespeicherte Werte haben Vorrang vor den Fallback-Werten im Code. Leer lassen um den Fallback zu verwenden.</p>
  </div>

  {#if loading}
    <p class="text-muted text-sm">Lädt…</p>
  {:else if loadError}
    <p class="text-red-400 text-sm">{loadError}</p>
  {:else}
    {#each pages as page}
      {@const desc = values[page.key]?.desc ?? ''}
      {@const descLen = desc.length}
      {@const titleVal = values[page.key]?.title ?? ''}
      {@const titleLen = titleVal.length}
      {@const ogImg = values[page.key]?.ogImage ?? ''}
      <div class="border border-dark-lighter rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-xs font-mono uppercase tracking-widest text-gold">{page.label}</p>
          <span class="text-xs text-muted font-mono">{page.path}</span>
        </div>

        <div>
          <label class={labelCls}>Seitentitel (title-Tag)</label>
          <input
            type="text"
            class={inputLineCls}
            bind:value={values[page.key].title}
            placeholder="Standard-Titel verwenden"
          />
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs {titleCharClass(titleLen)} font-mono">
              {titleLen} Zeichen
              {#if titleLen >= 50 && titleLen <= 70}(gut)
              {:else if titleLen > 70}(zu lang — Ziel: 50–70)
              {:else}(Ziel: 50–70){/if}
            </span>
          </div>
        </div>

        <div>
          <label class={labelCls}>Meta-Beschreibung</label>
          <textarea
            rows={3}
            class={inputCls}
            bind:value={values[page.key].desc}
            placeholder="Standard-Beschreibung verwenden"
          ></textarea>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs {descCharClass(descLen)} font-mono">
              {descLen} Zeichen
              {#if descLen < 120}(zu kurz — Ziel: 120–160){:else if descLen > 160}(zu lang — Ziel: 120–160){:else}(gut){/if}
            </span>
          </div>
        </div>

        <div>
          <label class={labelCls}>OG-Bild</label>
          {#if ogImg}
            <div class="flex items-center gap-3">
              <img src={ogImg} alt="OG-Bild Vorschau" class="h-16 w-auto rounded border border-dark-lighter" />
              <button
                onclick={() => removeOgImage(page.key)}
                class="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30"
              >
                Entfernen
              </button>
            </div>
          {:else}
            <p class="text-xs text-muted mb-2">Brand-Default wird verwendet.</p>
          {/if}
          <label class="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-dark-lighter text-light text-xs rounded-lg cursor-pointer hover:bg-dark-lighter/80">
            <span>{ogImg ? 'Anderes Bild hochladen' : 'Bild hochladen'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="hidden"
              onchange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) uploadOgImage(page.key, f);
                (e.target as HTMLInputElement).value = '';
              }}
            />
          </label>
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
