<script lang="ts">
  import HtmlEditor from './HtmlEditor.svelte';

  type BlockType = 'header' | 'angebot' | 'cta' | 'text' | 'footer';

  type ContentBlock = {
    id: string;
    title: string;
    block_type: BlockType;
    html_body: string;
    created_at: string;
    updated_at: string;
  };

  const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
    header: 'Kopfzeile',
    angebot: 'Angebot',
    cta: 'Call-to-Action',
    text: 'Textblock',
    footer: 'Abschluss',
  };

  const BLOCK_STARTERS: Record<BlockType, string> = {
    header: `<h1 style="color:#333;font-family:Georgia,serif;">Betreff-Zeile</h1>\n<p style="color:#666;font-family:sans-serif;">Willkommens-/Intro-Satz.</p>`,
    angebot: `<div style="border:1px solid #ddd;border-radius:8px;padding:20px;margin:16px 0;">\n  <h2 style="color:#333;font-family:sans-serif;margin:0 0 8px;">Angebots-Titel</h2>\n  <p style="color:#555;font-family:sans-serif;font-size:15px;">Kurze Beschreibung des Angebots.</p>\n  <p style="font-family:sans-serif;"><strong>Preis: 0 €</strong></p>\n</div>`,
    cta: `<div style="text-align:center;margin:24px 0;">\n  <a href="https://LINK" style="background:#b8973a;color:#fff;padding:12px 28px;border-radius:6px;font-family:sans-serif;font-weight:bold;text-decoration:none;display:inline-block;">\n    Jetzt buchen\n  </a>\n</div>`,
    text: `<p style="color:#555;font-family:sans-serif;font-size:16px;line-height:1.6;">\n  Ihr Text hier.\n</p>`,
    footer: `<p style="color:#888;font-family:sans-serif;font-size:14px;margin-top:32px;">\n  Mit freundlichen Grüßen,<br>\n  <strong>Ihr Name</strong>\n</p>`,
  };

  const BLOCK_TYPE_BADGE: Record<BlockType, string> = {
    header: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    angebot: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    cta: 'bg-gold/10 text-gold border-gold/20',
    text: 'bg-dark-lighter text-muted border-dark-lighter',
    footer: 'bg-green-500/10 text-green-400 border-green-500/20',
  };

  // ── State ─────────────────────────────────────────────────────────────────────
  let blocks: ContentBlock[] = $state([]);
  let loading = $state(true);
  let loadError = $state('');

  let selectedId: string | null = $state(null);
  let editTitle = $state('');
  let editType = $state<BlockType>('text');
  let editHtml = $state('');
  let editMsg = $state('');
  let editSaving = $state(false);

  let showNew = $state(false);
  let newTitle = $state('');
  let newType = $state<BlockType>('text');
  let newHtml = $state('');
  let newMsg = $state('');
  let newSaving = $state(false);

  let deleteConfirm: string | null = $state(null);

  // ── Load ──────────────────────────────────────────────────────────────────────
  async function loadBlocks() {
    loading = true; loadError = '';
    try {
      const res = await fetch('/api/admin/newsletter/blocks');
      blocks = res.ok ? await res.json() : [];
      if (!res.ok) loadError = 'Fehler beim Laden.';
    } catch {
      loadError = 'Verbindungsfehler.';
    } finally {
      loading = false;
    }
  }

  $effect(() => { loadBlocks(); });

  // ── Select ────────────────────────────────────────────────────────────────────
  function selectBlock(b: ContentBlock) {
    selectedId = b.id;
    editTitle = b.title;
    editType = b.block_type;
    editHtml = b.html_body;
    editMsg = '';
    showNew = false;
  }

  // ── Save edit ─────────────────────────────────────────────────────────────────
  async function saveEdit() {
    if (!selectedId || !editTitle.trim() || !editHtml.trim()) {
      editMsg = 'Titel und Inhalt sind erforderlich.'; return;
    }
    editSaving = true; editMsg = '';
    try {
      const res = await fetch(`/api/admin/newsletter/blocks/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, block_type: editType, html_body: editHtml }),
      });
      const data = await res.json();
      if (res.ok) {
        editMsg = 'Gespeichert.';
        blocks = blocks.map(b => b.id === selectedId ? { ...b, ...data } : b);
      } else {
        editMsg = data.error ?? 'Fehler beim Speichern.';
      }
    } catch {
      editMsg = 'Verbindungsfehler.';
    } finally {
      editSaving = false;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  async function confirmDelete(id: string) {
    const res = await fetch(`/api/admin/newsletter/blocks/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      deleteConfirm = null;
      blocks = blocks.filter(b => b.id !== id);
      if (selectedId === id) { selectedId = null; editTitle = ''; editHtml = ''; }
    }
  }

  // ── New block ─────────────────────────────────────────────────────────────────
  function openNew() {
    showNew = true;
    selectedId = null;
    newTitle = '';
    newType = 'text';
    newHtml = BLOCK_STARTERS['text'];
    newMsg = '';
  }

  $effect(() => {
    if (showNew) {
      newHtml = BLOCK_STARTERS[newType];
    }
  });

  async function createBlock() {
    if (!newTitle.trim() || !newHtml.trim()) {
      newMsg = 'Titel und Inhalt sind erforderlich.'; return;
    }
    newSaving = true; newMsg = '';
    try {
      const res = await fetch('/api/admin/newsletter/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, block_type: newType, html_body: newHtml }),
      });
      const data = await res.json();
      if (res.ok) {
        blocks = [data, ...blocks];
        showNew = false;
        selectBlock(data);
      } else {
        newMsg = data.error ?? 'Fehler beim Erstellen.';
      }
    } catch {
      newMsg = 'Verbindungsfehler.';
    } finally {
      newSaving = false;
    }
  }

  const BLOCK_TYPES: BlockType[] = ['header', 'angebot', 'cta', 'text', 'footer'];
</script>

<div class="flex gap-6 h-full min-h-[500px]">
  <!-- Left: block list -->
  <div class="w-56 flex-shrink-0 flex flex-col gap-2">
    <div class="flex items-center justify-between mb-1">
      <p class="text-xs text-muted font-medium uppercase tracking-widest">Blöcke</p>
      <button onclick={openNew}
        class="px-2 py-1 bg-gold text-dark text-xs font-semibold rounded hover:bg-gold/80">
        + Neu
      </button>
    </div>

    {#if loading}
      <p class="text-muted text-xs">Lade…</p>
    {:else if loadError}
      <p class="text-red-400 text-xs">{loadError}</p>
    {:else if blocks.length === 0}
      <p class="text-muted text-xs">Noch keine Blöcke. Erstelle deinen ersten.</p>
    {:else}
      <div class="flex flex-col gap-1">
        {#each blocks as b}
          <button
            onclick={() => selectBlock(b)}
            class={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${selectedId === b.id ? 'border-gold/60 bg-gold/10' : 'border-dark-lighter bg-dark-light hover:border-gold/30'}`}
          >
            <p class="text-light font-medium truncate">{b.title}</p>
            <span class={`inline-block mt-0.5 px-1.5 py-0 rounded border text-[10px] ${BLOCK_TYPE_BADGE[b.block_type]}`}>
              {BLOCK_TYPE_LABELS[b.block_type]}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Right: editor or new-block form -->
  <div class="flex-1 min-w-0">
    {#if showNew}
      <div class="space-y-4">
        <h3 class="text-sm font-semibold text-light">Neuer Block</h3>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-muted mb-1">Titel *</label>
            <input type="text" bind:value={newTitle} placeholder="z.B. Willkommens-Header"
              class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Typ</label>
            <select bind:value={newType}
              class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50">
              {#each BLOCK_TYPES as t}
                <option value={t}>{BLOCK_TYPE_LABELS[t]}</option>
              {/each}
            </select>
          </div>
        </div>

        <HtmlEditor
          bind:value={newHtml}
          previewMode="server"
          previewUrl="/api/admin/newsletter/preview"
          previewBody={() => ({ subject: newTitle || '(Vorschau)', html_body: newHtml })}
          label="HTML-Inhalt *"
          placeholder="<p>Block-Inhalt hier.</p>"
          rows={14}
        />

        {#if newMsg}<p class="text-red-400 text-sm">{newMsg}</p>{/if}
        <div class="flex gap-3">
          <button onclick={() => { showNew = false; }}
            class="px-4 py-2 bg-dark-lighter text-light rounded-lg text-sm hover:bg-dark-light">
            Abbrechen
          </button>
          <button onclick={createBlock} disabled={newSaving}
            class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50">
            {newSaving ? 'Erstelle…' : 'Block erstellen'}
          </button>
        </div>
      </div>

    {:else if selectedId}
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-muted mb-1">Titel *</label>
            <input type="text" bind:value={editTitle}
              class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Typ</label>
            <select bind:value={editType}
              class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50">
              {#each BLOCK_TYPES as t}
                <option value={t}>{BLOCK_TYPE_LABELS[t]}</option>
              {/each}
            </select>
          </div>
        </div>

        <HtmlEditor
          bind:value={editHtml}
          previewMode="server"
          previewUrl="/api/admin/newsletter/preview"
          previewBody={() => ({ subject: editTitle || '(Vorschau)', html_body: editHtml })}
          label="HTML-Inhalt *"
          placeholder="<p>Block-Inhalt hier.</p>"
          rows={14}
        />

        {#if editMsg}
          <p class={`text-sm ${editMsg === 'Gespeichert.' ? 'text-green-400' : 'text-red-400'}`}>{editMsg}</p>
        {/if}

        <div class="flex gap-3 items-center">
          <button onclick={saveEdit} disabled={editSaving}
            class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 disabled:opacity-50">
            {editSaving ? 'Speichere…' : 'Speichern'}
          </button>
          {#if deleteConfirm === selectedId}
            <span class="text-xs text-muted">Sicher löschen?</span>
            <button onclick={() => confirmDelete(selectedId!)}
              class="text-xs text-red-400 hover:text-red-300">Ja, löschen</button>
            <button onclick={() => deleteConfirm = null}
              class="text-xs text-muted hover:text-light">Abbrechen</button>
          {:else}
            <button onclick={() => deleteConfirm = selectedId}
              class="text-xs text-muted hover:text-red-400 transition-colors ml-auto">
              Löschen
            </button>
          {/if}
        </div>
      </div>

    {:else}
      <div class="flex items-center justify-center h-full text-muted text-sm">
        Wähle einen Block aus der Liste oder erstelle einen neuen.
      </div>
    {/if}
  </div>
</div>
