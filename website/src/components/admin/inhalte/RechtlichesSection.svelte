<script lang="ts">
  let { initialData, rechtlichesHasCustom = {} }: {
    initialData: Record<string, string>;
    rechtlichesHasCustom?: Record<string, boolean>;
  } = $props();

  // Intern tracken welche Felder schon gespeichert (custom) sind
  let customFlags = $state<Record<string, boolean>>(JSON.parse(JSON.stringify(rechtlichesHasCustom)));
  let data = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state<string | null>(null);
  let msg = $state(''); let msgOk = $state(true);

  const PAGES = [
    {
      key: 'datenschutz',
      label: 'Datenschutzerklärung',
      hint: 'HTML-Inhalt der Datenschutzseite.',
      liveUrl: '/datenschutz',
    },
    {
      key: 'agb',
      label: 'AGB',
      hint: 'HTML-Inhalt der AGB-Seite.',
      liveUrl: '/agb',
    },
    {
      key: 'barrierefreiheit',
      label: 'Barrierefreiheit',
      hint: 'HTML-Inhalt der Barrierefreiheitsseite.',
      liveUrl: '/barrierefreiheit',
    },
    {
      key: 'impressum-zusatz',
      label: 'Impressum-Zusatz',
      hint: 'Zusätzlicher HTML-Block nach den Pflichtangaben im Impressum. Bei leer: keine Ergänzung.',
      liveUrl: '/impressum',
    },
  ];

  async function save(key: string) {
    saving = key; msg = '';
    try {
      const res = await fetch(`/api/admin/legal/${key}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: data[key] }),
      });
      const json = await res.json();
      if (res.ok) {
        msg = 'Gespeichert.';
        msgOk = true;
        // Nach erstem Speichern: Badge wechselt auf "Eigener Text"
        customFlags = { ...customFlags, [key]: true };
      } else {
        msg = json.error ?? 'Fehler.';
        msgOk = false;
      }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = null; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50 font-mono';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Rechtliches</h2>
      <p class="text-muted mt-1 text-sm">Impressum-Zusatz, Datenschutz, AGB, Barrierefreiheit</p>
    </div>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <div class="p-4 bg-dark-light rounded-xl border border-gold/20 space-y-2">
    <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">Zentral gepflegte Elemente</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer-Links</strong> (Impressum, Datenschutz, AGB) sind automatisch im Footer vorhanden.</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer & Header-Standort</strong> → <a href="/admin/inhalte?tab=website&section=kontakt" class="text-gold hover:underline">Kontakt-Tab</a></p>
    <div class="mt-3 p-3 bg-dark rounded-lg border border-dark-lighter">
      <p class="text-xs text-muted">
        <strong class="text-light">ℹ️ Wie es funktioniert:</strong>
        Du siehst immer den aktuell aktiven Text – entweder deinen gespeicherten oder den eingebauten Standardtext als Vorschau.
        Speichern überschreibt den Standard dauerhaft. Den Live-Stand siehst du über den „Live ansehen“-Link.
      </p>
    </div>
  </div>

  {#each PAGES as page}
    <div class={sectionCls}>
      <div class="flex justify-between items-start">
        <div>
          <h3 class="text-xl font-bold text-light font-serif">{page.label}</h3>
          <p class="text-xs text-muted mt-1">{page.hint}</p>
        </div>
        <div class="flex items-center gap-3 flex-shrink-0">
          <a href={page.liveUrl} target="_blank" rel="noopener"
            class="text-xs text-muted hover:text-gold transition-colors">
            🔗 Live ansehen
          </a>
          <button onclick={() => save(page.key)} disabled={saving === page.key}
            class="px-4 py-2 bg-gold text-dark font-semibold rounded-lg text-sm hover:bg-gold/80 disabled:opacity-50">
            {saving === page.key ? 'Speichere…' : 'Speichern'}
          </button>
        </div>
      </div>

      <!-- Status-Badge -->
      {#if customFlags[page.key]}
        <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p class="text-xs text-green-400">
            <strong>🟢 Eigener Text aktiv</strong> – {(data[page.key] ?? '').length} Zeichen gespeichert. Wird auf der Website angezeigt.
          </p>
        </div>
      {:else}
        <div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <p class="text-xs text-blue-400">
            <strong>🔵 Standardtext (Vorschau)</strong> – Du siehst gerade den eingebauten Mustertext.
            Bearbeite und speichere ihn, um deinen eigenen Text dauerhaft zu aktivieren.
          </p>
        </div>
      {/if}

      <div>
        <label class={labelCls}>HTML-Inhalt</label>
        <textarea
          bind:value={data[page.key]}
          rows={18}
          class="{inputCls} resize-y"
        ></textarea>
      </div>
    </div>
  {/each}
</div>
