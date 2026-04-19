<!-- website/src/components/admin/CreateInvoiceModal.svelte -->
<script lang="ts">
  export interface ServiceOption {
    key: string;
    name: string;
    cents: number;
  }

  interface ClientOption {
    id: string;
    name: string;
    email: string;
  }

  let {
    serviceOptions,
    prefillEmail = '',
    prefillName = '',
    buttonLabel = '+ Neue Rechnung',
    buttonVariant = 'primary',
  }: {
    serviceOptions: ServiceOption[];
    prefillEmail?: string;
    prefillName?: string;
    buttonLabel?: string;
    buttonVariant?: 'primary' | 'ghost';
  } = $props();

  // ── Modal state ──────────────────────────────────────────────────────────
  let open = $state(false);

  // ── Form mode ────────────────────────────────────────────────────────────
  let asQuote = $state(false);

  // ── Customer ─────────────────────────────────────────────────────────────
  let clientsLoaded = $state(false);
  let clients = $state<ClientOption[]>([]);
  let clientSearch = $state('');
  let selectedClient = $state<ClientOption | null>(null);
  let externalMode = $state(false);
  let extName = $state('');
  let extEmail = $state('');
  let extCompany = $state('');
  let extVat = $state('');

  // ── Service / qty ─────────────────────────────────────────────────────────
  let selectedKey = $state(
    (serviceOptions.find(s => s.cents > 0) ?? serviceOptions[0])?.key ?? ''
  );
  let quantity = $state(1);

  // ── Misc ─────────────────────────────────────────────────────────────────
  let notes = $state('');
  let sendEmail = $state(true);
  let submitting = $state(false);
  let error = $state('');
  let success = $state('');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedService = $derived(serviceOptions.find(s => s.key === selectedKey));
  const totalEur = $derived(((selectedService?.cents ?? 0) * quantity) / 100);
  const fmtTotal = $derived(
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalEur)
  );
  const filteredClients = $derived(
    clientSearch.length < 1
      ? clients
      : clients.filter(
          c =>
            c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
            c.email.toLowerCase().includes(clientSearch.toLowerCase())
        )
  );
  const isPrefilled = $derived(!!prefillEmail);

  async function openModal() {
    open = true;
    error = '';
    success = '';
    if (isPrefilled) {
      externalMode = false;
      selectedClient = { id: '', name: prefillName || prefillEmail, email: prefillEmail };
    }
    if (!clientsLoaded && !isPrefilled) {
      await loadClients();
    }
  }

  function closeModal() {
    if (submitting) return;
    open = false;
    resetForm();
  }

  function resetForm() {
    asQuote = false;
    clientSearch = '';
    selectedClient = isPrefilled ? { id: '', name: prefillName || prefillEmail, email: prefillEmail } : null;
    externalMode = false;
    extName = '';
    extEmail = '';
    extCompany = '';
    extVat = '';
    selectedKey = (serviceOptions.find(s => s.cents > 0) ?? serviceOptions[0])?.key ?? '';
    quantity = 1;
    notes = '';
    sendEmail = true;
    error = '';
    success = '';
  }

  async function loadClients() {
    try {
      const res = await fetch('/api/admin/clients-list');
      if (res.ok) {
        clients = await res.json();
      }
    } catch {
      // combobox will show empty list; freetext still works
    } finally {
      clientsLoaded = true;
    }
  }

  function selectClient(c: ClientOption) {
    selectedClient = c;
    clientSearch = '';
  }

  async function submit() {
    error = '';
    success = '';

    if (!Number.isInteger(quantity) || quantity < 1) {
      error = 'Menge muss mindestens 1 sein.';
      return;
    }

    const customerName = externalMode ? extName.trim() : (selectedClient?.name ?? '');
    const customerEmail = externalMode ? extEmail.trim() : (selectedClient?.email ?? '');

    if (!customerName || !customerEmail) {
      error = 'Bitte einen Kunden auswählen oder Kundendaten eingeben.';
      return;
    }
    if (externalMode && !EMAIL_RE.test(customerEmail)) {
      error = 'Bitte eine gültige E-Mail-Adresse eingeben.';
      return;
    }
    if (!selectedKey) {
      error = 'Bitte eine Leistung auswählen.';
      return;
    }

    submitting = true;
    try {
      const payload: Record<string, unknown> = {
        name: customerName,
        email: customerEmail,
        company: externalMode ? extCompany || undefined : undefined,
        vatNumber: externalMode ? extVat || undefined : undefined,
        serviceKey: selectedKey,
        quantity,
        notes: notes.trim() || undefined,
        asQuote,
        sendEmail,
      };

      const res = await fetch('/api/billing/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        error = data.error ?? 'Unbekannter Fehler.';
        submitting = false;
        return;
      }

      success = asQuote
        ? `Angebot erstellt.`
        : `Rechnung ${data.data?.number ?? ''} erstellt.`;

      document.dispatchEvent(new CustomEvent('invoice-created'));
      submitting = true;
      setTimeout(() => closeModal(), 1200);
    } catch {
      error = 'Netzwerkfehler. Bitte erneut versuchen.';
      submitting = false;
    }
  }
</script>

<!-- Trigger button -->
{#if buttonVariant === 'primary'}
  <button
    onclick={openModal}
    class="px-4 py-2 bg-gold text-dark text-sm font-semibold rounded-lg hover:bg-gold/90 transition-colors"
  >
    {buttonLabel}
  </button>
{:else}
  <button
    onclick={openModal}
    class="px-3 py-1.5 text-xs font-medium text-gold border border-gold/40 rounded-lg hover:bg-gold/10 transition-colors"
  >
    {buttonLabel}
  </button>
{/if}

<!-- Modal overlay -->
{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
  >
    <div class="w-full max-w-lg bg-dark rounded-2xl border border-dark-lighter shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-dark-lighter">
        <h2 class="text-lg font-bold text-light font-serif">
          {asQuote ? 'Angebot erstellen' : 'Rechnung erstellen'}
        </h2>
        <button onclick={closeModal} class="text-muted hover:text-light transition-colors text-xl leading-none">✕</button>
      </div>

      <div class="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">

        <!-- Rechnung / Angebot tabs -->
        <div class="flex gap-1 p-1 bg-dark-light rounded-lg border border-dark-lighter">
          <button
            onclick={() => (asQuote = false)}
            class={`flex-1 py-1.5 text-sm font-medium rounded transition-colors ${!asQuote ? 'bg-gold text-dark' : 'text-muted hover:text-light'}`}
          >
            Rechnung
          </button>
          <button
            onclick={() => (asQuote = true)}
            class={`flex-1 py-1.5 text-sm font-medium rounded transition-colors ${asQuote ? 'bg-gold text-dark' : 'text-muted hover:text-light'}`}
          >
            Angebot
          </button>
        </div>

        <!-- Customer section -->
        <div>
          <label class="block text-xs text-muted uppercase tracking-wide mb-1">Kunde</label>
          {#if isPrefilled}
            <div class="px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light">
              {selectedClient?.name} <span class="text-muted">· {selectedClient?.email}</span>
            </div>
          {:else if !externalMode}
            <!-- Combobox -->
            {#if selectedClient}
              <div class="flex items-center gap-2 px-3 py-2 bg-dark-light border border-gold/40 rounded-lg text-sm">
                <span class="flex-1 text-light">{selectedClient.name} <span class="text-muted">· {selectedClient.email}</span></span>
                <button onclick={() => { selectedClient = null; clientSearch = ''; }} class="text-muted hover:text-red-400 text-xs">✕</button>
              </div>
            {:else}
              <input
                type="text"
                bind:value={clientSearch}
                placeholder="Name oder E-Mail eingeben…"
                class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50"
              />
              {#if clientSearch.length > 0 && filteredClients.length > 0}
                <ul class="mt-1 bg-dark-light border border-dark-lighter rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {#each filteredClients as c (c.id)}
                    <li>
                      <button
                        onclick={() => selectClient(c)}
                        class="w-full text-left px-3 py-2 text-sm hover:bg-dark/50 transition-colors"
                      >
                        <span class="text-light">{c.name}</span>
                        <span class="text-muted ml-1">· {c.email}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              {:else if clientSearch.length > 0}
                <p class="mt-1 px-3 py-2 text-xs text-muted">Keine Clients gefunden.</p>
              {/if}
            {/if}
            <button onclick={() => (externalMode = true)} class="mt-1 text-xs text-gold hover:underline">
              + Externer Kunde (manuell eingeben)
            </button>
          {:else}
            <!-- External freetext -->
            <div class="space-y-2">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-xs text-muted mb-1">Name *</label>
                  <input type="text" bind:value={extName} placeholder="Max Mustermann"
                    class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50" />
                </div>
                <div>
                  <label class="block text-xs text-muted mb-1">E-Mail *</label>
                  <input type="email" bind:value={extEmail} placeholder="max@firma.de"
                    class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50" />
                </div>
                <div>
                  <label class="block text-xs text-muted mb-1">Firma</label>
                  <input type="text" bind:value={extCompany} placeholder="Musterfirma GmbH"
                    class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50" />
                </div>
                <div>
                  <label class="block text-xs text-muted mb-1">USt-ID</label>
                  <input type="text" bind:value={extVat} placeholder="DE123456789"
                    class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50" />
                </div>
              </div>
              <button onclick={() => (externalMode = false)} class="text-xs text-muted hover:text-light">← Zurück zur Client-Auswahl</button>
            </div>
          {/if}
        </div>

        <!-- Service + quantity -->
        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2">
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Leistung</label>
            <select
              bind:value={selectedKey}
              class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light focus:outline-none focus:border-gold/50"
            >
              {#each serviceOptions as s (s.key)}
                <option value={s.key}>{s.name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Menge</label>
            <input
              type="number"
              min="1"
              bind:value={quantity}
              class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light text-center focus:outline-none focus:border-gold/50"
            />
          </div>
        </div>

        <!-- Amount preview -->
        <div class="flex items-center justify-between px-4 py-3 bg-dark-light rounded-xl border border-dark-lighter">
          <span class="text-sm text-muted">Gesamtbetrag</span>
          <span class="text-xl font-bold text-gold">{fmtTotal}</span>
        </div>

        <!-- Notes -->
        <div>
          <label class="block text-xs text-muted uppercase tracking-wide mb-1">Interne Notiz (optional)</label>
          <textarea
            bind:value={notes}
            rows={2}
            placeholder="z.B. Session vom 18.04.2026"
            class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted resize-none focus:outline-none focus:border-gold/50"
          ></textarea>
        </div>

        <!-- Send email toggle -->
        <div class="flex items-center justify-between px-4 py-3 bg-dark-light rounded-xl border border-dark-lighter">
          <span class="text-sm text-light">E-Mail an Kunden senden</span>
          <button
            role="switch"
            aria-checked={sendEmail}
            onclick={() => (sendEmail = !sendEmail)}
            class={`relative w-10 h-6 rounded-full transition-colors ${sendEmail ? 'bg-gold' : 'bg-dark-lighter'}`}
          >
            <span class={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${sendEmail ? 'left-5' : 'left-1'}`}></span>
          </button>
        </div>

        <!-- Error / success -->
        {#if error}
          <div class="px-4 py-3 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">{error}</div>
        {/if}
        {#if success}
          <div class="px-4 py-3 bg-green-900/30 border border-green-800 rounded-xl text-green-300 text-sm">{success}</div>
        {/if}

      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-dark-lighter flex gap-3 justify-end">
        <button onclick={closeModal} class="px-4 py-2 text-sm text-muted hover:text-light transition-colors">
          Abbrechen
        </button>
        <button
          onclick={submit}
          disabled={submitting}
          class="px-5 py-2 bg-gold text-dark text-sm font-semibold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if submitting}
            Wird erstellt…
          {:else}
            {asQuote ? 'Angebot erstellen →' : 'Rechnung erstellen →'}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
