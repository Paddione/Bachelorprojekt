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
      }
    } catch {
      // silent
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
      }
    } catch {
      // silent
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

  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    {#each links as link (link.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="relative"
        onmouseenter={() => (hoveredId = link.id)}
        onmouseleave={() => (hoveredId = null)}
      >
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
            onerror="this.style.display='none';this.nextElementSibling.style.display='block'"
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
          <button
            onclick={() => remove(link.id)}
            class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 hover:bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none transition-colors"
            aria-label="Link entfernen"
          >×</button>
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
