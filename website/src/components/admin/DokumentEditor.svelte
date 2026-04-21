<script lang="ts">
  import NewsletterAdmin from './NewsletterAdmin.svelte';

  type Template = {
    id: string;
    title: string;
    html_body: string;
    docuseal_template_id: number | null;
    created_at: string;
    updated_at: string;
  };

  let activeSection: 'newsletter' | 'vorlagen' = $state('newsletter');

  // ── Vertragsvorlagen ──────────────────────────────────────────────
  let templates: Template[] = $state([]);
  let tplLoading = $state(false);
  let tplError = $state('');

  let showCompose = $state(false);
  let editingId: string | null = $state(null);
  let composeTitle = $state('');
  let composeHtml = $state('');
  let composeMsg = $state('');
  let composeSaving = $state(false);
  let deleteConfirm: string | null = $state(null);

  async function loadTemplates() {
    tplLoading = true; tplError = '';
    try {
      const res = await fetch('/api/admin/documents/templates');
      templates = res.ok ? await res.json() : [];
      if (!res.ok) tplError = 'Fehler beim Laden.';
    } catch {
      tplError = 'Verbindungsfehler.';
    } finally {
      tplLoading = false;
    }
  }

  $effect(() => {
    if (activeSection === 'vorlagen') loadTemplates();
  });

  async function saveTemplate() {
    if (!composeTitle.trim() || !composeHtml.trim()) {
      composeMsg = 'Titel und Inhalt sind erforderlich.'; return;
    }
    composeSaving = true; composeMsg = '';
    try {
      const url = editingId
        ? `/api/admin/documents/templates/${editingId}`
        : '/api/admin/documents/templates';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: composeTitle, html_body: composeHtml }),
      });
      const data = await res.json();
      if (res.ok) {
        composeMsg = editingId ? 'Gespeichert.' : 'Vorlage erstellt.';
        showCompose = false;
        editingId = null;
        composeTitle = ''; composeHtml = '';
        await loadTemplates();
      } else {
        composeMsg = data.error ?? 'Fehler beim Speichern.';
      }
    } finally {
      composeSaving = false;
    }
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/admin/documents/templates/${id}`, { method: 'DELETE' });
    if (res.ok) { deleteConfirm = null; await loadTemplates(); }
  }

  function startEdit(t: Template) {
    editingId = t.id;
    composeTitle = t.title;
    composeHtml = t.html_body;
    showCompose = true;
    composeMsg = '';
  }

  function startNew() {
    editingId = null;
    composeTitle = ''; composeHtml = '';
    showCompose = true;
    composeMsg = '';
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>

<!-- Section switcher -->
<div class="flex gap-1 mb-8 border-b border-dark-lighter">
  <button
    onclick={() => activeSection = 'newsletter'}
    class={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeSection === 'newsletter' ? 'text-gold border-b-2 border-gold -mb-px bg-dark-light' : 'text-muted hover:text-light'}`}
  >Newsletter</button>
  <button
    onclick={() => activeSection = 'vorlagen'}
    class={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeSection === 'vorlagen' ? 'text-gold border-b-2 border-gold -mb-px bg-dark-light' : 'text-muted hover:text-light'}`}
  >Vertragsvorlagen</button>
</div>

{#if activeSection === 'newsletter'}
  <NewsletterAdmin />
{:else}
  <!-- ── Vertragsvorlagen ── -->
  <div>
    {#if !showCompose}
      <div class="flex justify-between items-center mb-4">
        <p class="text-muted text-sm">{templates.length} Vorlage{templates.length !== 1 ? 'n' : ''}</p>
        <button onclick={startNew} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">
          + Neue Vorlage
        </button>
      </div>
      {#if tplLoading}
        <p class="text-muted text-sm">Lade…</p>
      {:else if tplError}
        <p class="text-red-400 text-sm">{tplError}</p>
      {:else if templates.length === 0}
        <p class="text-muted text-sm">Noch keine Vorlagen.</p>
      {:else}
        <div class="flex flex-col gap-2">
          {#each templates as t}
            <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter flex items-center justify-between gap-4">
              <div class="flex-1 min-w-0">
                <p class="text-light font-medium truncate">{t.title}</p>
                <p class="text-muted text-xs mt-0.5">
                  {fmtDate(t.updated_at)}
                  {#if t.docuseal_template_id}
                    · <span class="text-green-400">DocuSeal #{t.docuseal_template_id}</span>
                  {/if}
                </p>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button onclick={() => startEdit(t)} class="text-xs text-muted hover:text-gold transition-colors">Bearbeiten</button>
                {#if deleteConfirm === t.id}
                  <span class="text-xs text-muted">Sicher?</span>
                  <button onclick={() => deleteTemplate(t.id)} class="text-xs text-red-400 hover:text-red-300">Ja</button>
                  <button onclick={() => deleteConfirm = null} class="text-xs text-muted hover:text-light">Nein</button>
                {:else}
                  <button onclick={() => deleteConfirm = t.id} class="text-xs text-muted hover:text-red-400 transition-colors">Löschen</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Compose / edit form -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-light">{editingId ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2>
            <button onclick={() => { showCompose = false; editingId = null; }} class="text-sm text-muted hover:text-light transition-colors">Abbrechen</button>
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">Titel *</label>
            <input
              type="text" bind:value={composeTitle} placeholder="z.B. Dienstleistungsvertrag 2026"
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none"
            />
          </div>
          <div class="flex flex-col flex-1">
            <label class="block text-sm text-muted mb-1">HTML-Inhalt *</label>
            <textarea
              bind:value={composeHtml}
              placeholder="<h1>Vertrag</h1><p>Inhalt hier…</p>"
              rows="18"
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm font-mono focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none resize-y"
            ></textarea>
            <p class="text-xs text-muted mt-1">
              Verfügbare Platzhalter (werden beim Zuweisen automatisch befüllt):
              <span class="font-mono text-gold/80">&#123;&#123;KUNDENNAME&#125;&#125;</span>
              <span class="font-mono text-gold/80">&#123;&#123;KUNDENNUMMER&#125;&#125;</span>
              <span class="font-mono text-gold/80">&#123;&#123;EMAIL&#125;&#125;</span>
              <span class="font-mono text-gold/80">&#123;&#123;TELEFON&#125;&#125;</span>
              <span class="font-mono text-gold/80">&#123;&#123;FIRMA&#125;&#125;</span>
              <span class="font-mono text-gold/80">&#123;&#123;VORNAME&#125;&#125;</span>
              <span class="font-mono text-gold/80">&#123;&#123;NACHNAME&#125;&#125;</span>
              <span class="font-mono text-gold/80">&#123;&#123;DATUM&#125;&#125;</span>
              <span class="font-mono text-gold/80">&#123;&#123;JAHR&#125;&#125;</span>
            </p>
          </div>
          {#if composeMsg}
            <p class={`text-sm ${composeMsg.includes('Fehler') || composeMsg.includes('erforderlich') ? 'text-red-400' : 'text-green-400'}`}>{composeMsg}</p>
          {/if}
          <div class="flex gap-3">
            <button onclick={saveTemplate} disabled={composeSaving} class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50">
              {composeSaving ? 'Speichere…' : 'Speichern'}
            </button>
          </div>
        </div>
        <div>
          <p class="text-sm text-muted mb-1">Vorschau</p>
          <iframe
            srcdoc={composeHtml || '<p style="color:#666;font-family:sans-serif;padding:20px;">Vorschau erscheint hier…</p>'}
            title="Vertragsvorschau"
            class="w-full h-[500px] rounded-xl border border-dark-lighter bg-white"
          ></iframe>
        </div>
      </div>
    {/if}
  </div>
{/if}
