<!-- website/src/components/admin/AdminShortcuts.svelte -->
<script lang="ts">
  interface Shortcut {
    id: string;
    url: string;
    label: string;
    sortOrder: number;
    createdAt: Date | string;
  }

  let { links: initialLinks }: { links: Shortcut[] } = $props();

  let links = $state<Shortcut[]>(initialLinks);
  let showForm = $state(false);
  let formUrl = $state('');
  let formLabel = $state('');
  let fetching = $state(false);
  let saving = $state(false);
  let hoveredId = $state<string | null>(null);

  // Inline rename state
  let editingId = $state<string | null>(null);
  let editLabel = $state('');
  let editUrl = $state('');
  let editSaving = $state(false);

  // Error surfacing — replaces the previous silent catches
  let errorMsg = $state<string | null>(null);
  let errorTimer: ReturnType<typeof setTimeout> | null = null;
  function showError(msg: string) {
    errorMsg = msg;
    if (errorTimer) clearTimeout(errorTimer);
    errorTimer = setTimeout(() => { errorMsg = null; }, 5000);
  }
  async function readError(res: Response, fallback: string): Promise<string> {
    try {
      const j = await res.json();
      return j?.error ?? fallback;
    } catch {
      return fallback;
    }
  }

  function faviconUrl(url: string): string {
    try {
      const { hostname } = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      return '';
    }
  }

  async function onUrlBlur() {
    if (!formUrl.startsWith('https://') || fetching) return;
    fetching = true;
    try {
      const res = await fetch(
        `/api/admin/shortcuts/fetch-title?url=${encodeURIComponent(formUrl)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.title && !formLabel) formLabel = data.title;
      }
    } catch {
      // silent — admin fills in manually
    } finally {
      fetching = false;
    }
  }

  async function save() {
    if (!formUrl.startsWith('https://') || !formLabel.trim() || saving) return;
    saving = true;
    try {
      const res = await fetch('/api/admin/shortcuts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: formUrl.trim(), label: formLabel.trim() }),
      });
      if (res.ok) {
        const shortcut = await res.json();
        links = [...links, shortcut];
        formUrl = '';
        formLabel = '';
        showForm = false;
      } else {
        showError(await readError(res, 'Speichern fehlgeschlagen.'));
      }
    } catch (e) {
      showError('Netzwerkfehler beim Speichern.');
    } finally {
      saving = false;
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch('/api/admin/shortcuts/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        links = links.filter(l => l.id !== id);
      } else {
        showError(await readError(res, 'Löschen fehlgeschlagen.'));
      }
    } catch (e) {
      showError('Netzwerkfehler beim Löschen.');
    }
  }

  function startEdit(link: Shortcut) {
    editingId = link.id;
    editLabel = link.label;
    editUrl = link.url;
  }
  function cancelEdit() {
    editingId = null;
    editLabel = '';
    editUrl = '';
  }
  async function saveEdit() {
    if (!editingId || editSaving) return;
    const trimmedLabel = editLabel.trim();
    const trimmedUrl = editUrl.trim();
    if (!trimmedLabel || !trimmedUrl.startsWith('https://')) return;
    editSaving = true;
    try {
      const res = await fetch('/api/admin/shortcuts/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, url: trimmedUrl, label: trimmedLabel }),
      });
      if (res.ok) {
        const updated = await res.json();
        links = links.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        cancelEdit();
      } else {
        showError(await readError(res, 'Aktualisieren fehlgeschlagen.'));
      }
    } catch {
      showError('Netzwerkfehler beim Aktualisieren.');
    } finally {
      editSaving = false;
    }
  }

  function closeForm() {
    showForm = false;
    formUrl = '';
    formLabel = '';
  }
</script>

<div class="mb-6">
  <p class="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Eigene Links</p>

  {#if errorMsg}
    <div class="mb-3 px-3 py-2 bg-red-900/30 border border-red-800 text-red-200 text-xs rounded-lg flex items-center justify-between gap-2">
      <span>{errorMsg}</span>
      <button onclick={() => { errorMsg = null; }} aria-label="Fehlermeldung schließen" class="text-red-300 hover:text-red-100">×</button>
    </div>
  {/if}

  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    {#each links as link (link.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="relative"
        onmouseenter={() => (hoveredId = link.id)}
        onmouseleave={() => (hoveredId = null)}
      >
        {#if editingId === link.id}
          <div class="flex flex-col gap-1.5 p-3 bg-dark-light rounded-xl border border-gold/40">
            <input
              type="text"
              bind:value={editLabel}
              placeholder="Name"
              class="w-full bg-dark rounded border border-dark-lighter px-2 py-1 text-xs text-light placeholder:text-muted focus:outline-none focus:border-gold/50"
            />
            <input
              type="url"
              bind:value={editUrl}
              placeholder="https://"
              class="w-full bg-dark rounded border border-dark-lighter px-2 py-1 text-xs text-light placeholder:text-muted focus:outline-none focus:border-gold/50"
            />
            <div class="flex gap-1.5">
              <button
                onclick={saveEdit}
                disabled={editSaving || !editLabel.trim() || !editUrl.startsWith('https://')}
                class="flex-1 px-2 py-1 bg-gold text-dark text-[11px] font-semibold rounded hover:bg-gold/90 disabled:opacity-40"
              >
                {editSaving ? '…' : 'Speichern'}
              </button>
              <button
                onclick={cancelEdit}
                class="px-2 py-1 bg-dark border border-dark-lighter text-[11px] text-muted hover:text-light rounded"
              >✕</button>
            </div>
          </div>
        {:else}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            class="flex flex-col items-center gap-1.5 p-4 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors text-center"
          >
            <img
              src={faviconUrl(link.url)}
              alt=""
              width="24"
              height="24"
              class="rounded-sm"
              onerror={(e) => { const img = e.currentTarget as HTMLImageElement; img.style.display = 'none'; (img.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'block'); }}
            />
            <!-- Fallback icon -->
            <svg
              style="display:none"
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="text-muted"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span class="text-xs font-medium text-muted truncate w-full text-center">{link.label}</span>
          </a>

          {#if hoveredId === link.id}
            <div class="absolute -top-1.5 -right-1.5 flex gap-1">
              <button
                onclick={() => startEdit(link)}
                class="w-5 h-5 bg-gray-700 hover:bg-gray-600 text-white rounded-full text-[10px] flex items-center justify-center leading-none transition-colors"
                aria-label="Link bearbeiten"
                title="Bearbeiten"
              >✎</button>
              <button
                onclick={() => remove(link.id)}
                class="w-5 h-5 bg-red-600 hover:bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none transition-colors"
                aria-label="Link entfernen"
                title="Entfernen"
              >×</button>
            </div>
          {/if}
        {/if}
      </div>
    {/each}

    <!-- + Button -->
    {#if !showForm}
      <button
        onclick={() => (showForm = true)}
        class="flex flex-col items-center gap-1.5 p-4 bg-dark-light rounded-xl border border-dashed border-dark-lighter hover:border-gold/40 transition-colors text-center"
      >
        <span class="text-2xl leading-none text-muted">+</span>
        <span class="text-xs font-medium text-muted">Link</span>
      </button>
    {/if}
  </div>

  <!-- Inline-Formular -->
  {#if showForm}
    <div class="mt-3 p-4 bg-dark-light rounded-xl border border-dark-lighter">
      <div class="flex flex-col sm:flex-row gap-3 items-end">
        <div class="flex-1">
          <label class="text-xs text-muted mb-1 block" for="sc-url">URL</label>
          <input
            id="sc-url"
            type="url"
            placeholder="https://"
            bind:value={formUrl}
            onblur={onUrlBlur}
            class="w-full bg-dark rounded-lg border border-dark-lighter px-3 py-2 text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50"
          />
        </div>
        <div class="flex-1">
          <label class="text-xs text-muted mb-1 block" for="sc-label">
            Label
            {#if fetching}<span class="text-gold/60 ml-1">⟳</span>{/if}
          </label>
          <input
            id="sc-label"
            type="text"
            placeholder="wird automatisch erkannt…"
            bind:value={formLabel}
            class="w-full bg-dark rounded-lg border border-dark-lighter px-3 py-2 text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50"
          />
        </div>
        <div class="flex gap-2 pb-0.5">
          <button
            onclick={save}
            disabled={saving || !formUrl.startsWith('https://') || !formLabel.trim()}
            class="px-4 py-2 bg-gold text-dark text-sm font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '…' : 'Speichern'}
          </button>
          <button
            onclick={closeForm}
            class="px-3 py-2 bg-dark rounded-lg border border-dark-lighter text-sm text-muted hover:text-light transition-colors"
          >✕</button>
        </div>
      </div>
    </div>
  {/if}
</div>
