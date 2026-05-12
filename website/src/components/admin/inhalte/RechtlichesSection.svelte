<script lang="ts">
  let { initialData }: { initialData: Record<string, string> } = $props();
  let data = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state<string | null>(null);
  let msg = $state(''); let msgOk = $state(true);

  const PAGES = [
    { key: 'impressum-zusatz', label: 'Impressum-Zusatz', hint: 'Zusätzlicher HTML-Block im Impressum (z.B. Haftungsausschluss). Wird nach den Pflichtangaben eingefügt.' },
    { key: 'datenschutz', label: 'Datenschutzerklärung', hint: 'Vollständiger HTML-Inhalt der Datenschutzseite.' },
    { key: 'agb', label: 'AGB', hint: 'Vollständiger HTML-Inhalt der AGB-Seite.' },
    { key: 'barrierefreiheit', label: 'Barrierefreiheit', hint: 'Vollständiger HTML-Inhalt der Barrierefreiheitsseite.' },
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
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
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
      <p class="text-muted mt-1 text-sm">Impressum, Datenschutz, AGB, Barrierefreiheit</p>
    </div>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Hinweis-Block -->
  <div class="p-4 bg-dark-light rounded-xl border border-gold/20 space-y-1">
    <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">Zentral gepflegte Elemente</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer-Links</strong> (Impressum, Datenschutz, AGB) werden automatisch im Footer angezeigt.</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer & Header-Standort</strong> → <a href="/admin/inhalte?tab=website&section=kontakt" class="text-gold hover:underline">Kontakt-Tab</a></p>
  </div>

  <!-- Inhalte direkt sichtbar (kein Details/Summary) -->
  {#each PAGES as page}
    <div class={sectionCls}>
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-xl font-bold text-light font-serif">{page.label}</h3>
          <p class="text-xs text-muted mt-1">{page.hint}</p>
        </div>
        <button onclick={() => save(page.key)} disabled={saving === page.key}
          class="px-4 py-2 bg-gold text-dark font-semibold rounded-lg text-sm hover:bg-gold/80 disabled:opacity-50">
          {saving === page.key ? 'Speichere…' : 'Speichern'}
        </button>
      </div>
      <!-- Inhalt sofort sichtbar, nicht hinter Details/Summary versteckt -->
      <div>
        <label class={labelCls}>HTML-Inhalt</label>
        <textarea
          bind:value={data[page.key]}
          rows={14}
          class="{inputCls} resize-y"
          placeholder="<p>Inhalt hier einfügen...</p>"
        ></textarea>
        <p class="text-xs text-muted mt-1">
          {(data[page.key] ?? '').length} Zeichen
          {#if !data[page.key]?.trim()}
            – <span class="text-yellow-400">leer (Standardinhalt aus dem Code wird angezeigt)</span>
          {:else}
            – <span class="text-green-400">individuelle Version aktiv</span>
          {/if}
        </p>
      </div>
    </div>
  {/each}
</div>
