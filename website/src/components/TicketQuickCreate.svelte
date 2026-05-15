<script lang="ts">
  type Context = 'admin' | 'portal';
  type TicketType = 'bug' | 'feature' | 'task' | 'project';
  type Priority = 'hoch' | 'mittel' | 'niedrig';
  type BugCategory = 'fehler' | 'verbesserung' | 'erweiterungswunsch' | 'zahlung';

  let {
    context = 'portal',
    defaultCategory = 'verbesserung',
  }: { context?: Context; defaultCategory?: BugCategory } = $props();

  let open = $state(false);
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);

  // Admin-form state
  let adminType = $state<TicketType>('bug');
  let adminTitle = $state('');
  let adminDescription = $state('');
  let adminPriority = $state<Priority>('mittel');
  let adminComponent = $state('');

  // Portal-form state (mirrors BugReportWidget)
  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_FILES = 3;
  const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let portalEmail = $state('');
  let portalCategory = $state<BugCategory>(defaultCategory);
  let portalDescription = $state('');
  let portalFiles = $state<File[]>([]);
  let fileError = $state('');
  let fileInputEl = $state<HTMLInputElement | null>(null);

  let triggerButtonEl = $state<HTMLButtonElement | null>(null);
  let dialogEl = $state<HTMLDivElement | null>(null);

  function openModal() { open = true; result = null; }
  function closeModal() { if (submitting) return; open = false; }

  function resetAdminForm() {
    adminType = 'bug'; adminTitle = ''; adminDescription = '';
    adminPriority = 'mittel'; adminComponent = ''; result = null;
  }

  function resetPortalForm() {
    portalEmail = ''; portalCategory = defaultCategory;
    portalDescription = ''; portalFiles = []; fileError = ''; result = null;
    if (fileInputEl) fileInputEl.value = '';
  }

  function onFileChange(e: Event) {
    fileError = '';
    const input = e.target as HTMLInputElement;
    if (!input.files) return;
    for (const picked of Array.from(input.files)) {
      if (portalFiles.length >= MAX_FILES) { fileError = `Maximal ${MAX_FILES} Screenshots.`; break; }
      if (picked.size > MAX_BYTES) { fileError = `"${picked.name}" zu groß (max. 5 MB).`; continue; }
      if (!ALLOWED_MIME.includes(picked.type)) { fileError = `"${picked.name}": nur PNG, JPEG, WEBP.`; continue; }
      if (portalFiles.some(f => f.name === picked.name && f.size === picked.size)) { fileError = `"${picked.name}" bereits hinzugefügt.`; continue; }
      portalFiles = [...portalFiles, picked];
    }
    input.value = '';
  }

  function removeFile(i: number) { portalFiles = portalFiles.filter((_, idx) => idx !== i); fileError = ''; }

  const adminCanSubmit = $derived(
    adminTitle.trim().length > 0 && !submitting
  );

  const portalCanSubmit = $derived(
    portalDescription.trim().length > 0 &&
    EMAIL_RE.test(portalEmail) &&
    !submitting && !fileError
  );

  async function submitAdmin(e: Event) {
    e.preventDefault();
    if (!adminCanSubmit) return;
    submitting = true; result = null;
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: adminType,
          title: adminTitle.trim(),
          description: adminDescription.trim() || undefined,
          priority: adminPriority,
          component: adminComponent.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Fetch external_id (T######) — POST returns UUID only
        let externalId = '';
        if (data.id) {
          const detail = await fetch(`/api/admin/tickets/${data.id}`).then(r => r.json()).catch(() => null);
          externalId = detail?.ticket?.externalId ?? '';
        }
        result = { success: true, message: `Ticket angelegt${externalId ? ` (${externalId})` : ''}.` };
        resetAdminForm();
        setTimeout(() => { open = false; result = null; }, 2000);
      } else {
        result = { success: false, message: data.error ?? 'Fehler beim Anlegen.' };
      }
    } catch { result = { success: false, message: 'Verbindungsfehler.' }; }
    finally { submitting = false; }
  }

  async function submitPortal(e: Event) {
    e.preventDefault();
    if (!portalCanSubmit) return;
    submitting = true; result = null;
    const fd = new FormData();
    fd.append('description', portalDescription.trim());
    fd.append('email', portalEmail.trim());
    fd.append('category', portalCategory);
    fd.append('url', window.location.href);
    fd.append('userAgent', navigator.userAgent);
    fd.append('viewport', `${window.innerWidth}x${window.innerHeight}`);
    for (const file of portalFiles) fd.append('screenshot', file, file.name);
    try {
      const res = await fetch('/api/bug-report', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        const tid = data.ticketId ?? '';
        result = { success: true, message: tid ? `Meldung als ${tid} aufgenommen.` : 'Vielen Dank! Meldung übermittelt.' };
        resetPortalForm();
        setTimeout(() => { open = false; result = null; }, 2000);
      } else {
        result = { success: false, message: data.error ?? 'Fehler beim Übermitteln.' };
      }
    } catch { result = { success: false, message: 'Verbindungsfehler.' }; }
    finally { submitting = false; }
  }

  function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && open) closeModal(); }

  let effectInitialized = false;
  $effect(() => {
    const isOpen = open;
    if (!effectInitialized) { effectInitialized = true; return; }
    if (isOpen && dialogEl) {
      dialogEl.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    } else if (!isOpen && triggerButtonEl) {
      triggerButtonEl.focus();
    }
  });

  const TYPE_LABELS: Record<TicketType, string> = {
    bug: 'Bug', feature: 'Feature', task: 'Aufgabe', project: 'Projekt',
  };
  const PRIORITY_LABELS: Record<Priority, string> = {
    hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig',
  };
</script>

<svelte:window onkeydown={onKeydown} />

<button
  type="button"
  bind:this={triggerButtonEl}
  onclick={openModal}
  aria-label={context === 'admin' ? 'Ticket erstellen' : 'Fehler melden'}
  class="flex items-center gap-2 bg-gold hover:bg-gold-light text-dark px-4 py-3 rounded-full font-semibold shadow-lg transition-colors cursor-pointer"
>
  <span aria-hidden="true">+</span>
  <span>{context === 'admin' ? 'Ticket erstellen' : 'Fehler melden'}</span>
</button>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    onclick={closeModal}
  >
    <div
      bind:this={dialogEl}
      class="bg-dark border border-dark-lighter rounded-xl max-w-lg w-full p-6 shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tqc-modal-title"
    >
      <div class="flex items-start justify-between mb-4">
        <h2 id="tqc-modal-title" class="text-xl font-bold text-light">
          {context === 'admin' ? 'Neues Ticket' : 'Fehler melden'}
        </h2>
        <button
          type="button"
          onclick={closeModal}
          aria-label="Schließen"
          class="text-muted hover:text-light text-2xl leading-none cursor-pointer bg-transparent border-0"
        >×</button>
      </div>

      {#if context === 'admin'}
        <!-- Admin form -->
        <form onsubmit={submitAdmin} class="space-y-4">
          <div>
            <label for="tqc-type" class="block text-sm font-medium text-light mb-1">
              Typ <span class="text-gold">*</span>
            </label>
            <select
              id="tqc-type"
              bind:value={adminType}
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
            >
              {#each Object.entries(TYPE_LABELS) as [val, label]}
                <option value={val}>{label}</option>
              {/each}
            </select>
          </div>

          <div>
            <label for="tqc-title" class="block text-sm font-medium text-light mb-1">
              Titel <span class="text-gold">*</span>
            </label>
            <input
              id="tqc-title"
              type="text"
              bind:value={adminTitle}
              maxlength="200"
              required
              placeholder="Kurze Zusammenfassung"
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
            />
          </div>

          <div>
            <label for="tqc-desc" class="block text-sm font-medium text-light mb-1">
              Beschreibung
            </label>
            <textarea
              id="tqc-desc"
              bind:value={adminDescription}
              maxlength="2000"
              rows="4"
              placeholder="Details, Kontext, Reproduktionsschritte…"
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim resize-y"
            ></textarea>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="tqc-priority" class="block text-sm font-medium text-light mb-1">Priorität</label>
              <select
                id="tqc-priority"
                bind:value={adminPriority}
                class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
              >
                {#each Object.entries(PRIORITY_LABELS) as [val, label]}
                  <option value={val}>{label}</option>
                {/each}
              </select>
            </div>
            <div>
              <label for="tqc-component" class="block text-sm font-medium text-light mb-1">Komponente</label>
              <input
                id="tqc-component"
                type="text"
                bind:value={adminComponent}
                maxlength="100"
                placeholder="z.B. Chat, Auth"
                class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!adminCanSubmit}
            class="w-full bg-gold hover:bg-gold-light disabled:bg-dark-lighter disabled:text-muted-dark text-dark px-4 py-2.5 rounded font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting ? 'Wird angelegt…' : 'Ticket anlegen'}
          </button>

          {#if result}
            <div class="p-3 rounded text-sm {result.success ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'}">
              {result.message}
            </div>
          {/if}
        </form>

      {:else}
        <!-- Portal form (identical to legacy BugReportWidget) -->
        <form onsubmit={submitPortal} class="space-y-4">
          <div>
            <label for="tqc-email" class="block text-sm font-medium text-light mb-1">
              Ihre E-Mail <span class="text-gold">*</span>
            </label>
            <input
              id="tqc-email"
              type="email"
              bind:value={portalEmail}
              required
              placeholder="max@example.com"
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
            />
          </div>

          <div>
            <label for="tqc-category" class="block text-sm font-medium text-light mb-1">
              Kategorie <span class="text-gold">*</span>
            </label>
            <select
              id="tqc-category"
              bind:value={portalCategory}
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim"
            >
              <option value="verbesserung">Verbesserungsvorschlag</option>
              <option value="erweiterungswunsch">Idee / Wunsch</option>
              <option value="fehler">Problem / Fehler melden</option>
              <option value="zahlung">Zahlungsproblem</option>
            </select>
          </div>

          <div>
            <label for="tqc-portal-desc" class="block text-sm font-medium text-light mb-1">
              Beschreibung <span class="text-gold">*</span>
            </label>
            <textarea
              id="tqc-portal-desc"
              bind:value={portalDescription}
              maxlength="2000"
              rows="5"
              required
              placeholder="Was ist passiert? Was haben Sie erwartet?"
              class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim resize-y"
            ></textarea>
          </div>

          <div>
            <label for="tqc-screenshot" class="block text-sm font-medium text-light mb-1">
              Screenshots <span class="text-muted-dark">(optional, bis zu 3, max. 5 MB)</span>
            </label>
            {#if portalFiles.length < 3}
              <input
                id="tqc-screenshot"
                bind:this={fileInputEl}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onchange={onFileChange}
                class="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-gold file:text-dark file:font-semibold hover:file:bg-gold-light cursor-pointer"
              />
            {/if}
            {#if portalFiles.length > 0}
              <ul class="mt-2 space-y-1">
                {#each portalFiles as file, i}
                  <li class="text-xs text-muted flex items-center gap-2">
                    <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                    <button type="button" onclick={() => removeFile(i)} class="text-gold hover:underline bg-transparent border-0 cursor-pointer">Entfernen</button>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if fileError}
              <p class="text-xs text-red-400 mt-1">{fileError}</p>
            {/if}
          </div>

          <button
            type="submit"
            disabled={!portalCanSubmit}
            class="w-full bg-gold hover:bg-gold-light disabled:bg-dark-lighter disabled:text-muted-dark text-dark px-4 py-2.5 rounded font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting ? 'Wird gesendet…' : 'Meldung senden'}
          </button>

          {#if result}
            <div class="p-3 rounded text-sm {result.success ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'}">
              {result.message}
            </div>
          {/if}
        </form>
      {/if}
    </div>
  </div>
{/if}
