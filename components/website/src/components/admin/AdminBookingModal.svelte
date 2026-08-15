<script lang="ts">
  import AdminBookingSlotPicker from './AdminBookingSlotPicker.svelte';
  import AdminModal from './ui/AdminModal.svelte';

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

  // Custom date/time mode for admin manual bookings
  let useCustomTime = $state(false);
  let customDate = $state('');
  let customStartTime = $state('09:00');
  let customDurationMin = $state(60);
  const isCallback = $derived(bookingType === 'callback');

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
    useCustomTime = false;
    customDate = '';
    customStartTime = '09:00';
    customDurationMin = 60;
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
    } finally {
      clientsLoaded = true;
    }
  }

  async function submit() {
    error = '';
    const clientEmail = isPrefilled ? prefillEmail : (selectedClient?.email ?? '');
    const clientName = isPrefilled ? (prefillName || prefillEmail) : (selectedClient?.name ?? '');

    if (!clientEmail) { error = 'Bitte einen Client auswählen.'; return; }
    if (!leistungKey)  { error = 'Bitte eine Leistung auswählen.'; return; }
    if (!isCallback) {
      if (useCustomTime) {
        if (!customDate || !customStartTime) { error = 'Bitte Datum und Uhrzeit eingeben.'; return; }
      } else if (!selectedSlot) {
        error = 'Bitte einen Termin wählen.'; return;
      }
    }
    if (isCallback && !phone.trim())  { error = 'Telefonnummer erforderlich.'; return; }

    let slotStart: string | null = null;
    let slotEnd: string | null = null;
    let slotDisplay: string | null = null;
    if (!isCallback) {
      if (useCustomTime && customDate && customStartTime) {
        const [h, m] = customStartTime.split(':').map(Number);
        const start = new Date(customDate);
        start.setHours(h, m, 0, 0);
        const end = new Date(start.getTime() + customDurationMin * 60000);
        slotStart = start.toISOString();
        slotEnd = end.toISOString();
        const eH = end.getHours().toString().padStart(2,'0');
        const eM = end.getMinutes().toString().padStart(2,'0');
        slotDisplay = `${customStartTime} – ${eH}:${eM}`;
      } else {
        slotStart = selectedSlot?.start ?? null;
        slotEnd = selectedSlot?.end ?? null;
        slotDisplay = selectedSlot?.display ?? null;
      }
    }

    submitting = true;
    try {
      const body: Record<string, unknown> = {
        clientEmail,
        clientName,
        type: bookingType,
        leistungKey,
        projectId: projectId || null,
        slotStart,
        slotEnd,
        slotDisplay,
        date: useCustomTime ? customDate : (selectedDate || null),
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

{#snippet modalContent()}
  <div class="modal-content">
    {#if error}<p class="err">{error}</p>{/if}
    {#if success}<p class="info">{success}</p>{/if}

    {#if !isPrefilled}
      <div class="client-section">
        <label>Client</label>
        {#if selectedClient}
          <div class="selected-client">
            <span class="client-name">{selectedClient.name}</span>
            <span class="client-email">· {selectedClient.email}</span>
            <button onclick={() => { selectedClient = null; clientSearch = ''; }} class="btn-clear">✕</button>
          </div>
        {:else}
          <input
            type="text"
            placeholder="Name oder E-Mail suchen…"
            bind:value={clientSearch}
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
          />
          {#if clientSearch.length > 0 && filteredClients.length > 0}
            <div class="client-list">
              {#each filteredClients as c}
                <button onclick={() => { selectedClient = c; clientSearch = ''; }} class="client-item">
                  {c.name} <span class="client-email-sub">· {c.email}</span>
                </button>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    <div class="form-grid">
      <div class="form-group">
        <label>Typ</label>
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

      <div class="form-group">
        <label>Leistung</label>
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
      <div class="form-group">
        <label>Projekt <span class="sub-label">(optional)</span></label>
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
        <div class="form-group">
          <label>Termin</label>
          <AdminBookingSlotPicker
            bind:useCustomTime={useCustomTime}
            bind:customDate={customDate}
            bind:customStartTime={customStartTime}
            bind:customDurationMin={customDurationMin}
            daySlots={daySlots}
            slotsLoaded={slotsLoaded}
            slotsError={slotsError}
            bind:selectedDate={selectedDate}
            bind:selectedSlot={selectedSlot}
          />
        </div>
      {/if}

      {#if isCallback}
        <div class="form-group">
          <label>Telefon</label>
          <input
            type="tel"
            placeholder="+49 151 …"
            bind:value={phone}
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
          />
        </div>
      {/if}

      <div class="form-group">
        <label>Nachricht <span class="sub-label">(optional)</span></label>
        <textarea
          bind:value={message}
          rows="3"
          placeholder="Interne Notiz oder Nachricht an den Client…"
          class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-none"
        ></textarea>
      </div>
    </div>
  </div>
{/snippet}

{#snippet modalFooter()}
  <div class="actions">
    <button onclick={closeModal} disabled={submitting}>Abbrechen</button>
    <button onclick={submit} disabled={submitting}>{submitting ? '…' : 'Buchung anlegen'}</button>
  </div>
{/snippet}

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

<AdminModal
  bind:open
  title="Leistung buchen{isPrefilled ? ` für ${prefillName || prefillEmail}` : ''}"
  onclose={closeModal}
  body={modalContent}
  footer={modalFooter}
/>

<style>
  .err { color: #c96e6e; }
  .info { color: var(--brass); background: rgba(201, 165, 92, 0.08); border: 1px solid rgba(201, 165, 92, 0.3); border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 12px; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
  button { background: var(--brass); color: var(--ink-900); border: none; padding: 0.55rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
  .actions button:first-of-type { background: transparent; color: var(--fg); border: 1px solid var(--ink-750); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .mode-tabs { display: flex; gap: 0.25rem; padding: 0.25rem; background: var(--ink-900); border-radius: 6px; border: 1px solid var(--ink-750); }
  .mode-tabs button { flex: 1; background: transparent; color: var(--fg-soft); padding: 0.4rem; font-size: 12px; font-weight: 500; }
  .mode-tabs button.active { background: var(--ink-750); color: var(--fg); }
  .hint { margin: 0; color: var(--fg-soft); font-size: 11px; }
  .hint code { background: var(--ink-900); padding: 0.05rem 0.3rem; border-radius: 3px; font-family: var(--font-mono); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; }
  .form-group { display: flex; flex-direction: column; gap: 0.25rem; }
  .client-section { margin-bottom: 1rem; }
  .selected-client { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem; background: var(--ink-900); border: 1px solid var(--ink-750); border-radius: 8px; font-size: 13px; }
  .client-name { color: var(--fg); font-weight: 600; }
  .client-email { color: var(--fg-soft); }
  .client-list { display: flex; flex-direction: column; gap: 0.25rem; border: 1px solid var(--ink-750); border-radius: 8px; max-height: 150px; overflow-y: auto; }
  .client-item { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--ink-800); cursor: pointer; transition: background 0.2s; }
  .client-item:hover { background: var(--ink-900); }
  .client-email-sub { color: var(--fg-soft); font-size: 11px; }
  .sub-label { font-size: 10px; font-weight: 700; }
</style>
