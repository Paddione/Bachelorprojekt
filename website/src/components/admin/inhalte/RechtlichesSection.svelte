<script lang="ts">
  let { initialData }: { initialData: Record<string, string> } = $props();
  let data = $state(JSON.parse(JSON.stringify(initialData)));
  let saving = $state<string | null>(null);
  let msg = $state(''); let msgOk = $state(true);

  const PAGES = [
    {
      key: 'datenschutz',
      label: 'Datenschutzerklärung',
      hint: 'HTML-Inhalt der Datenschutzseite. Wenn leer: Standardtext aus dem Code wird angezeigt.',
      liveUrl: '/datenschutz',
    },
    {
      key: 'agb',
      label: 'AGB',
      hint: 'HTML-Inhalt der AGB-Seite. Wenn leer: Standardtext aus dem Code wird angezeigt.',
      liveUrl: '/agb',
    },
    {
      key: 'barrierefreiheit',
      label: 'Barrierefreiheit',
      hint: 'HTML-Inhalt der Barrierefreiheitsseite. Wenn leer: Standardtext aus dem Code wird angezeigt.',
      liveUrl: '/barrierefreiheit',
    },
    {
      key: 'impressum-zusatz',
      label: 'Impressum-Zusatz',
      hint: 'Zusätzlicher HTML-Block im Impressum (z.B. Haftungsausschluss). Wird nach den Pflichtangaben eingefügt.',
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
      <p class="text-muted mt-1 text-sm">Impressum-Zusatz, Datenschutz, AGB, Barrierefreiheit</p>
    </div>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Hinweis-Block -->
  <div class="p-4 bg-dark-light rounded-xl border border-gold/20 space-y-2">
    <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">Zentral gepflegte Elemente</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer-Links</strong> (Impressum, Datenschutz, AGB) sind automatisch im Footer vorhanden.</p>
    <p class="text-sm text-muted">🔒 <strong class="text-light">Footer & Header-Standort</strong> → <a href="/admin/inhalte?tab=website&section=kontakt" class="text-gold hover:underline">Kontakt-Tab</a></p>
    <div class="mt-3 p-3 bg-dark rounded-lg border border-dark-lighter">
      <p class="text-xs text-muted">
        <strong class="text-light">ℹ️ Wie es funktioniert:</strong>
        Wenn das Textfeld leer ist, wird der <strong class="text-light">eingebaute Standardtext</strong> angezeigt (rechtlich geprüfter Mustertext).
        Eigener Text überschreibt den Standard vollständig. Den aktuellen Live-Inhalt siehst du über den „Live ansehen“-Link.
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

      <!-- Status-Anzeige -->
      {#if !data[page.key]?.trim()}
        <div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <p class="text-xs text-blue-400">
            <strong>Standardtext aktiv</strong> – Das Feld ist leer. Auf der Website wird der eingebaute Mustertext angezeigt.
            Fülle das Feld, um einen eigenen Text zu verwenden.
          </p>
        </div>
      {:else}
        <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p class="text-xs text-green-400">
            <strong>Eigener Text aktiv</strong> – {(data[page.key] ?? '').length} Zeichen gespeichert.
          </p>
        </div>
      {/if}

      <div>
        <label class={labelCls}>HTML-Inhalt (leer lassen für Standardtext)</label>
        <textarea
          bind:value={data[page.key]}
          rows={14}
          class="{inputCls} resize-y"
          placeholder="<p>Eigenen Inhalt hier einfügen...</p>\n<p>Leer lassen für eingebauten Standardtext.</p>"
        ></textarea>
      </div>
    </div>
  {/each}
</div>
