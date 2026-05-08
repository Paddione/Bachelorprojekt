<script lang="ts">
  type PageDef = { key: string; label: string; fallback: string };

  const PAGES: PageDef[] = [
    {
      key: 'home',
      label: 'Startseite',
      fallback: 'Coaching & digitale Begleitung in Lüneburg und Hamburg – persönlich, erfahren, auf Augenhöhe.',
    },
    {
      key: 'kontakt',
      label: 'Kontakt',
      fallback: 'Nehmen Sie Kontakt auf – kostenloses Erstgespräch, kein Verkaufsdruck.',
    },
    {
      key: 'ueber-mich',
      label: 'Über mich',
      fallback: 'Gerald Korczewski – 30+ Jahre Führungserfahrung, systemischer Coach, digitaler Begleiter für die Generation 50+.',
    },
    {
      key: 'leistungen',
      label: 'Angebote',
      fallback: 'Coaching, digitale Begleitung 50+ und Unternehmensberatung – Angebote von Gerald Korczewski.',
    },
  ];

  // values[pageKey] = current textarea value
  let values = $state<Record<string, string>>({});
  let savingKey = $state<string | null>(null);
  let messages = $state<Record<string, { text: string; ok: boolean }>>({});
  let loading = $state(true);
  let loadError = $state('');

  async function load() {
    try {
      const res = await fetch('/api/admin/seo');
      if (!res.ok) { loadError = 'Fehler beim Laden.'; return; }
      const data: Record<string, string> = await res.json();
      const initial: Record<string, string> = {};
      for (const p of PAGES) {
        initial[p.key] = data[p.key] ?? p.fallback;
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
        body: JSON.stringify({ pageKey, description: values[pageKey] ?? '' }),
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
  const labelCls = 'block text-xs text-muted mb-1 font-mono uppercase tracking-widest';
</script>

<div class="pt-8 pb-20 space-y-6 max-w-2xl">
  <div>
    <h2 class="text-lg font-bold text-light font-serif mb-1">SEO & Meta-Beschreibungen</h2>
    <p class="text-sm text-muted">Diese Texte erscheinen in Suchergebnissen und beim Teilen in sozialen Netzwerken. Ideal: 120–160 Zeichen.</p>
  </div>

  {#if loading}
    <p class="text-muted text-sm">Lädt…</p>
  {:else if loadError}
    <p class="text-red-400 text-sm">{loadError}</p>
  {:else}
    {#each PAGES as page}
      {@const len = (values[page.key] ?? '').length}
      <div class="border border-dark-lighter rounded-xl p-4 space-y-2">
        <label class={labelCls}>{page.label}</label>
        <textarea
          rows={3}
          class={inputCls}
          bind:value={values[page.key]}
          placeholder={page.fallback}
        ></textarea>
        <div class="flex items-center justify-between gap-4">
          <span class="text-xs {charClass(len)} font-mono">
            {len} Zeichen
            {#if len < 120}(zu kurz — Ziel: 120–160){:else if len > 160}(zu lang — Ziel: 120–160){:else}(gut){/if}
          </span>
          <div class="flex items-center gap-3">
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
      </div>
    {/each}
  {/if}
</div>
