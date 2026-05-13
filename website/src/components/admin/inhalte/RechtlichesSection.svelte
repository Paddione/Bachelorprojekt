<script lang="ts">
  let { initialData, rechtlichesHasCustom = {} }: {
    initialData: Record<string, string>;
    rechtlichesHasCustom?: Record<string, boolean>;
  } = $props();

  // 6 Unterseiten gemäß Screenshot
  const SUBPAGES = [
    { key: 'impressum-zusatz', label: 'Impressum',         liveUrl: '/impressum',       hint: 'Die Pflichtangaben (Name, Adresse, Kontakt) werden automatisch aus der Konfiguration generiert. Hier können optional zusätzliche Absätze eingefügt werden.' },
    { key: 'datenschutz',      label: 'Datenschutz',       liveUrl: '/datenschutz',     hint: 'Vollständiger HTML-Inhalt der Datenschutzseite. Leer = Standardtext.' },
    { key: 'meine-daten',      label: 'Meine Daten',       liveUrl: '/meine-daten',     hint: 'Die "Meine Daten"-Seite ist technisch generiert (DSGVO-Auskunft/Löschung) und nicht über diesen Editor pflegbar.' },
    { key: 'agb',              label: 'AGB',               liveUrl: '/agb',             hint: 'Vollständiger HTML-Inhalt der AGB-Seite. Leer = Standardtext.' },
    { key: 'barrierefreiheit', label: 'Barrierefreiheit',  liveUrl: '/barrierefreiheit',hint: 'Vollständiger HTML-Inhalt der Barrierefreiheitsseite. Leer = Standardtext.' },
    { key: 'cookie',           label: 'Cookie-Einstellungen', liveUrl: null,            hint: 'Cookie-Einstellungen öffnen sich über den Footer-Link als Dialog und sind nicht direkt pflegbar.' },
  ];

  let activeKey = $state('impressum-zusatz');
  let customFlags = $state<Record<string, boolean>>(JSON.parse(JSON.stringify(rechtlichesHasCustom)));
  let data = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state(false);
  let msg = $state(''); let msgOk = $state(true);

  const activePage = $derived(SUBPAGES.find(p => p.key === activeKey)!);
  const isReadonly = $derived(activeKey === 'meine-daten' || activeKey === 'cookie');

  async function save() {
    if (isReadonly) return;
    saving = true; msg = '';
    try {
      const res = await fetch(`/api/admin/legal/${activeKey}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: data[activeKey] ?? '' }),
      });
      const json = await res.json();
      if (res.ok) {
        msg = 'Gespeichert.'; msgOk = true;
        customFlags = { ...customFlags, [activeKey]: true };
      } else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50 font-mono resize-y';
  const labelCls = 'block text-xs text-muted mb-1';
  const tabCls = (active: boolean) =>
    `px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
      active ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-light'
    }`;
</script>

<div class="pt-6 pb-20 space-y-6">
  <!-- Header -->
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Rechtliches</h2>
      <p class="text-muted mt-1 text-sm">Impressum, Datenschutz, AGB und weitere rechtliche Seiten</p>
    </div>
    {#if !isReadonly}
      <button onclick={save} disabled={saving}
        class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
        {saving ? 'Speichere…' : 'Speichern'}
      </button>
    {/if}
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Hinweis-Block -->
  <div class="p-4 bg-dark-light rounded-xl border border-gold/20 space-y-1">
    <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">Zentral gepflegte Elemente</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer-Links</strong> (Impressum, Datenschutz, AGB) sind automatisch im Footer vorhanden.</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer & Header-Standort</strong> → <a href="/admin/inhalte?tab=website&section=kontakt" class="text-gold hover:underline">Kontakt-Tab</a></p>
  </div>

  <!-- Untermenü -->
  <div class="border-b border-dark-lighter overflow-x-auto">
    <div class="flex">
      {#each SUBPAGES as page}
        <button onclick={() => { activeKey = page.key; msg = ''; }} class={tabCls(activeKey === page.key)}>
          {page.label}
          {#if page.key !== 'meine-daten' && page.key !== 'cookie'}
            {#if customFlags[page.key]}
              <span class="ml-1 text-green-400" title="Eigener Text aktiv">●</span>
            {:else}
              <span class="ml-1 text-blue-400" title="Standardtext aktiv">○</span>
            {/if}
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Aktiver Bereich -->
  <div class="p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4">
    <div class="flex items-start justify-between">
      <div>
        <h3 class="text-xl font-bold text-light font-serif">{activePage.label}</h3>
        <p class="text-xs text-muted mt-1">{activePage.hint}</p>
      </div>
      {#if activePage.liveUrl}
        <a href={activePage.liveUrl} target="_blank" rel="noopener"
          class="text-xs text-muted hover:text-gold transition-colors flex-shrink-0">
          🔗 Live ansehen
        </a>
      {/if}
    </div>

    {#if isReadonly}
      <!-- Meine Daten & Cookie: nur Hinweis -->
      <div class="p-4 bg-dark rounded-xl border border-dark-lighter">
        {#if activeKey === 'meine-daten'}
          <p class="text-sm text-muted">
            Die Seite <code class="text-gold">/meine-daten</code> ist technisch generiert und über OIDC geschützt.
            Eingeloggte Nutzer können dort Auskunft anfordern und ihr Konto löschen (DSGVO Art. 15/17).
            Sie ist nicht über diesen Editor pflegbar.
          </p>
          <a href="/meine-daten" target="_blank" rel="noopener"
            class="mt-3 inline-block text-xs text-gold hover:underline">
            🔗 Seite aufrufen
          </a>
        {:else if activeKey === 'cookie'}
          <p class="text-sm text-muted">
            Die Cookie-Einstellungen öffnen sich als Dialog über den Footer-Link „Cookie-Einstellungen“.
            Der Dialog selbst wird über den Cookie-Consent-Banner gesteuert und ist nicht direkt pflegbar.
          </p>
        {/if}
      </div>
    {:else}
      <!-- Status-Badge -->
      {#if activeKey === 'impressum-zusatz'}
        <div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <p class="text-xs text-blue-400">
            <strong>ℹ️ Impressum-Pflichtangaben</strong> werden automatisch aus der Systemkonfiguration generiert (Name, Adresse, Kontakt, USt-ID).
            Hier nur optionale Ergänzungen eintragen, z.B. Haftungsausschluss oder Bildnachweise.
          </p>
        </div>
      {:else if customFlags[activeKey]}
        <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p class="text-xs text-green-400">
            <strong>🟢 Eigener Text aktiv</strong> – {(data[activeKey] ?? '').length} Zeichen gespeichert.
          </p>
        </div>
      {:else}
        <div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <p class="text-xs text-blue-400">
            <strong>🔵 Standardtext (Vorschau)</strong> – Du siehst den eingebauten Mustertext.
            Bearbeite und speichere, um deinen eigenen Text dauerhaft zu aktivieren.
          </p>
        </div>
      {/if}

      <div>
        <label class={labelCls}>HTML-Inhalt</label>
        <textarea
          bind:value={data[activeKey]}
          rows={20}
          class={inputCls}
        ></textarea>
      </div>
    {/if}
  </div>
</div>
