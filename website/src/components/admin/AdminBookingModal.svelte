<script lang="ts">
  interface Leistung {
    key: string;
    name: string;
    category: string;
  }

  interface TimeSlot {
    start: string;
    end: string;
    display: string;
  }

  interface DaySlots {
    date: string;
    weekday: string;
    slots: TimeSlot[];
  }

  interface Project {
    id: string;
    name: string;
  }

  interface ClientOption {
    id: string;
    name: string;
    email: string;
  }

  let {
    prefillEmail = '',
    prefillName = '',
    projects = [],
    buttonLabel = '＋ Leistung buchen',
    buttonVariant = 'primary',
  }: {
    prefillEmail?: string;
    prefillName?: string;
    projects?: Project[];
    buttonLabel?: string;
    buttonVariant?: 'primary' | 'ghost';
  } = $props();

  const isPrefilled = $derived(!!prefillEmail);

  let open = $state(false);
  let submitting = $state(false);
  let error = $state('');
  let success = $state('');

  let clients = $state<ClientOption[]>([]);
  let clientsLoaded = $state(false);
  let clientSearch = $state('');
  let selectedClient = $state<ClientOption | null>(null);

  const filteredClients = $derived(
    clientSearch.length < 1
      ? clients
      : clients.filter(
          c =>
            c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
            c.email.toLowerCase().includes(clientSearch.toLowerCase())
        )
  );

  let bookingType = $state<'erstgespraech' | 'callback' | 'meeting' | 'termin'>('erstgespraech');
  let leistungKey = $state('');
  let projectId = $state('');
  let phone = $state('');
  let message = $state('');

  let leistungen = $state<Leistung[]>([]);
  let leistungenLoaded = $state(false);

  let selectedDate = $state('');
  let daySlots = $state<DaySlots[]>([]);
  let slotsLoaded = $state(false);
  let slotsError = $state('');
  let selectedSlot = $state<TimeSlot | null>(null);

  const isCallback = $derived(bookingType === 'callback');

  const slotsForDate = $derived(
    daySlots.find(d => d.date === selectedDate)?.slots ?? []
  );

  const availableDates = $derived(
    daySlots.filter(d => d.slots.length > 0).map(d => d.date)
  );

  async function openModal() {
    open = true;
    error = '';
    success = '';
    resetForm();
    if (!leistungenLoaded) loadLeistungen();
    if (!slotsLoaded) loadSlots();
    if (!isPrefilled && !clientsLoaded) loadClients();
  }

  function closeModal() {
    if (submitting) return;
    open = false;
  }

  function resetForm() {
    bookingType = 'erstgespraech';
    leistungKey = '';
    projectId = '';
    phone = '';
    message = '';
    selectedDate = '';
    selectedSlot = null;
    clientSearch = '';
    selectedClient = isPrefilled
      ? { id: '', name: prefillName || prefillEmail, email: prefillEmail }
      : null;
    error = '';
    success = '';
  }

  async function loadLeistungen() {
    try {
      const res = await fetch('/api/leistungen');
      if (res.ok) leistungen = await res.json();
    } catch {
      // Dropdown bleibt leer
    } finally {
      leistungenLoaded = true;
    }
  }

  async function loadSlots() {
    slotsError = '';
    try {
      const res = await fetch('/api/calendar/slots');
      if (res.ok) {
        const loaded: DaySlots[] = await res.json();
        daySlots = loaded;
        const firstAvailable = loaded.find(d => d.slots.length > 0);
        if (firstAvailable) selectedDate = firstAvailable.date;
      }
    } catch {
      slotsError = 'Slots konnten nicht geladen werden.';
    } finally {
      slotsLoaded = true;
    }
  }

  async function loadClients() {
    try {
      const res = await fetch('/api/admin/clients-list');
      if (res.ok) clients = await res.json();
    } catch {
      // Combobox bleibt leer
    } finally {
      clientsLoaded = true;
    }
  }

  async function submit() {
    error = '';
    const clientEmail = isPrefilled ? prefillEmail : (selectedClient?.email ?? '');
    const clientName  = isPrefilled ? (prefillName || prefillEmail) : (selectedClient?.name ?? '');

    if (!clientEmail) { error = 'Bitte einen Client auswählen.'; return; }
    if (!leistungKey)  { error = 'Bitte eine Leistung auswählen.'; return; }
    if (!isCallback && !selectedSlot) { error = 'Bitte einen Termin wählen.'; return; }
    if (isCallback && !phone.trim())  { error = 'Telefonnummer erforderlich.'; return; }

    submitting = true;
    try {
      const body: Record<string, unknown> = {
        clientEmail,
        clientName,
        type: bookingType,
        leistungKey,
        projectId: projectId || null,
        slotStart: selectedSlot?.start ?? null,
        slotEnd: selectedSlot?.end ?? null,
        slotDisplay: selectedSlot?.display ?? null,
        date: selectedDate || null,
        phone: phone || null,
        message: message || null,
      };

      const res = await fetch('/api/admin/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        error = data.error ?? 'Unbekannter Fehler.';
        submitting = false;
        return;
      }

      success = 'Buchung erfolgreich angelegt.';
      submitting = false;
      document.dispatchEvent(new CustomEvent('admin-booking-created'));
      setTimeout(() => closeModal(), 1500);
    } catch {
      error = 'Netzwerkfehler. Bitte erneut versuchen.';
      submitting = false;
    }
  }
</script>

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

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
  >
    <div class="w-full max-w-lg bg-dark rounded-2xl border border-dark-lighter shadow-2xl overflow-hidden">

      <div class="flex items-center justify-between px-6 py-4 border-b border-dark-lighter">
        <h2 class="text-lg font-bold text-light font-serif">
          Leistung buchen{isPrefilled ? ` für ${prefillName || prefillEmail}` : ''}
        </h2>
        <button onclick={closeModal} class="text-muted hover:text-light transition-colors text-xl leading-none">✕</button>
      </div>

      <div class="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">

        {#if error}
          <div class="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
        {/if}
        {#if success}
          <div class="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">{success}</div>
        {/if}

        {#if !isPrefilled}
          <div>
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Client</label>
            {#if selectedClient}
              <div class="flex items-center gap-2 px-3 py-2 bg-dark-light border border-gold/40 rounded-lg text-sm">
                <span class="text-light flex-1">{selectedClient.name} <span class="text-muted">· {selectedClient.email}</span></span>
                <button onclick={() => { selectedClient = null; clientSearch = ''; }} class="text-muted hover:text-light text-xs">✕</button>
              </div>
            {:else}
              <input
                type="text"
                placeholder="Name oder E-Mail suchen…"
                bind:value={clientSearch}
                class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
              />
              {#if clientSearch.length > 0 && filteredClients.length > 0}
                <div class="mt-1 bg-dark border border-dark-lighter rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {#each filteredClients as c}
                    <button
                      onclick={() => { selectedClient = c; clientSearch = ''; }}
                      class="w-full text-left px-3 py-2 text-sm text-light hover:bg-dark-light transition-colors"
                    >
                      {c.name} <span class="text-muted">· {c.email}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        {/if}

        <div>
          <label class="block text-xs text-muted uppercase tracking-wide mb-1">Typ</label>
          <select
            bind:value={bookingType}
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
          >
            <option value="erstgespraech">Kostenloses Erstgespräch</option>
            <option value="meeting">Online-Meeting</option>
            <option value="termin">Termin vor Ort</option>
            <option value="callback">Rückruf</option>
          </select>
        </div>

        <div>
          <label class="block text-xs text-muted uppercase tracking-wide mb-1">Leistung</label>
          <select
            bind:value={leistungKey}
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
          >
            <option value="">— Bitte wählen —</option>
            {#each leistungen as l}
              <option value={l.key}>{l.category} · {l.name}</option>
            {/each}
          </select>
        </div>

        {#if projects.length > 0}
          <div>
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Projekt <span class="normal-case text-muted/60">(optional)</span></label>
            <select
              bind:value={projectId}
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
            >
              <option value="">— Kein Projekt —</option>
              {#each projects as p}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        {#if !isCallback}
          <div>
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Datum</label>
            {#if !slotsLoaded}
              <p class="text-sm text-muted">Lade Slots…</p>
            {:else if slotsError}
              <p class="text-sm text-red-400">{slotsError}</p>
            {:else if availableDates.length === 0}
              <p class="text-sm text-muted">Keine freien Slots verfügbar.</p>
            {:else}
              <select
                bind:value={selectedDate}
                onchange={() => { selectedSlot = null; }}
                class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
              >
                {#each daySlots.filter(d => d.slots.length > 0) as d}
                  <option value={d.date}>{d.weekday}, {d.date}</option>
                {/each}
              </select>
            {/if}
          </div>

          {#if selectedDate && slotsForDate.length > 0}
            <div>
              <label class="block text-xs text-muted uppercase tracking-wide mb-1">Uhrzeit</label>
              <div class="flex flex-wrap gap-2">
                {#each slotsForDate as slot}
                  <button
                    onclick={() => { selectedSlot = slot; }}
                    class={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedSlot?.start === slot.start ? 'bg-gold text-dark font-semibold' : 'bg-dark-light border border-dark-lighter text-light hover:border-gold/40'}`}
                  >
                    {slot.display}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {/if}

        {#if isCallback}
          <div>
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Telefon</label>
            <input
              type="tel"
              placeholder="+49 151 …"
              bind:value={phone}
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
            />
          </div>
        {/if}

        <div>
          <label class="block text-xs text-muted uppercase tracking-wide mb-1">Nachricht <span class="normal-case text-muted/60">(optional)</span></label>
          <textarea
            bind:value={message}
            rows="3"
            placeholder="Interne Notiz oder Nachricht an den Client…"
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-none"
          ></textarea>
        </div>

      </div>

      <div class="flex justify-end gap-3 px-6 py-4 border-t border-dark-lighter">
        <button
          onclick={closeModal}
          disabled={submitting}
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors disabled:opacity-50"
        >
          Abbrechen
        </button>
        <button
          onclick={submit}
          disabled={submitting}
          class="px-5 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50"
        >
          {submitting ? '…' : 'Buchung anlegen'}
        </button>
      </div>

    </div>
  </div>
{/if}
