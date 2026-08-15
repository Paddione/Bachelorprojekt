<script lang="ts">
  import { onMount } from 'svelte';

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

  interface Props {
    initialDate?: string;
    initialStart?: string;
    initialEnd?: string;
    initialType?: 'erstgespraech' | 'callback' | 'meeting' | 'termin';
    serviceKey?: string;
  }
  let { initialDate = '', initialStart = '', initialEnd = '', initialType = '', serviceKey } = $props<Props>();

  let name = $state('');
  let email = $state('');
  let phone = $state('');
  let bookingType = $state(initialType || 'erstgespraech');
  let message = $state('');
  let selectedSlot = $state<TimeSlot | null>(
    initialStart && initialEnd
      ? { start: initialStart, end: initialEnd, display: `${initialStart} - ${initialEnd}` }
      : null
  );
  let selectedDate = $state(initialDate);

  let days = $state<DaySlots[]>([]);
  let loading = $state(true);
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);
  let agbAccepted = $state(false);

  let portalProjects = $state<Array<{ id: string; name: string }>>([]);
  let leistungenOptions = $state<Array<{ key: string; name: string; category: string; durationMin?: number }>>([]);
  let selectedProjectId = $state('');
  let selectedLeistungKey = $state('');
  let leistungenLoaded = $state(false);

  onMount(async () => {
    try {
      const res = await fetch('/api/leistungen');
      if (res.ok) leistungenOptions = await res.json();
    } catch { /* ignore */ } finally {
      leistungenLoaded = true;
    }

    try {
      const res = await fetch('/api/portal/projekte');
      if (res.ok) portalProjects = await res.json();
    } catch { /* ignore */ }
  });

  // Duration mapping per booking type (minutes)
  const TYPE_DURATIONS: Record<string, number> = {
    erstgespraech: 30,
    meeting: 60,
    termin: 60,
  };

  let isCallback = $derived(bookingType === 'callback');
  // Step 2 (leistung) is considered "done" when leistung is selected or none available
  let leistungSelected = $derived(selectedLeistungKey !== '' || (leistungenLoaded && leistungenOptions.length === 0));
  let showSlotSelection = $derived(!isCallback && leistungSelected);
  let showContactForm = $derived(isCallback || selectedSlot !== null);
  let currentDaySlots = $derived(days.find((d) => d.date === selectedDate));

  const bookingTypes = [
    { value: 'erstgespraech', label: 'Kostenloses Erstgespräch (30 Min.)' },
    { value: 'callback', label: 'Rückruf' },
    { value: 'meeting', label: 'Online-Meeting' },
    { value: 'termin', label: 'Termin vor Ort' },
  ];

  let slotLoadError = $state(false);
  let slotsLoading = $state(false);

  async function loadSlots() {
    if (isCallback) return;
    slotsLoading = true;
    loading = true;
    slotLoadError = false;
    // Don't reset selectedSlot here — onclick handlers that trigger a reload (leistung/type change)
    // already set selectedSlot = null before this runs, preserving URL-pre-filled slots.
    days = [];
    const selectedLeistung = leistungenOptions.find(l => l.key === selectedLeistungKey);
    const duration = selectedLeistung?.durationMin ?? TYPE_DURATIONS[bookingType] ?? undefined;
    const params = new URLSearchParams();
    if (duration) params.set('durationMin', String(duration));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(`/api/calendar/slots${params.size ? '?' + params.toString() : ''}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await r.json();
      if (Array.isArray(data)) {
        days = data;
        if (!initialDate && data.length > 0) selectedDate = data[0].date;
        else if (initialDate) selectedDate = initialDate;
      }
    } catch {
      clearTimeout(timeoutId);
      slotLoadError = true;
    } finally {
      loading = false;
      slotsLoading = false;
    }
  }

  // Load slots when leistung selection is ready
  $effect(() => {
    if (showSlotSelection && days.length === 0 && !slotsLoading && !slotLoadError) {
      loadSlots();
    }
  });

  function selectSlot(slot: TimeSlot) {
    selectedSlot = slot;
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  let _prevDate = selectedDate;
  $effect(() => {
    // Reset selected slot when user changes the date
    if (selectedDate !== _prevDate) {
      _prevDate = selectedDate;
      selectedSlot = null;
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if ((!selectedSlot && !isCallback) || !agbAccepted) return;
    submitting = true;
    result = null;

    try {
      const response = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          type: bookingType,
          message,
          slotStart: selectedSlot?.start ?? null,
          slotEnd: selectedSlot?.end ?? null,
          slotDisplay: selectedSlot ? formatSlotTime(selectedSlot.start, selectedSlot.end) : null,
          date: selectedDate,
          serviceKey: serviceKey ?? null,
          projectId: selectedProjectId || undefined,
          leistungKey: selectedLeistungKey || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        result = { success: true, message: 'Vielen Dank! Ihre Terminanfrage wurde eingereicht. Sie erhalten eine Bestätigung per E-Mail, sobald der Termin bestätigt wurde.' };
        name = '';
        email = '';
        phone = '';
        message = '';
        selectedSlot = null;
        selectedLeistungKey = '';
        selectedProjectId = '';
      } else {
        result = { success: false, message: data.error || 'Es ist ein Fehler aufgetreten.' };
      }
    } catch {
      result = { success: false, message: 'Verbindungsfehler. Bitte versuchen Sie es später erneut.' };
    } finally {
      submitting = false;
    }
  }

  // Format ISO timestamp in user's local timezone so slot times are correct
  // regardless of server timezone (server runs UTC, users may be in CEST etc.)
  function formatSlotTime(isoStart: string, isoEnd: string): string {
    const fmt = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return `${fmt(isoStart)} - ${fmt(isoEnd)}`;
  }

</script>

<div class="bf-root">

  <!-- Step 1: Booking type segment control -->
  <div class="bf-section">
    <p class="bf-step-label">Art des Termins</p>
    <div class="bf-type-row">
      {#each bookingTypes as bt}
        <button
          type="button"
          class="bf-type-btn"
          class:is-active={bookingType === bt.value}
          onclick={() => { bookingType = bt.value; selectedLeistungKey = ''; selectedSlot = null; days = []; }}
        >
          {bt.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Step 2: Leistung -->
  {#if !isCallback && leistungenOptions.length > 0}
    <div class="bf-section">
      <p class="bf-step-label">Gewünschte Leistung</p>
      <div class="bf-leistung-row">
        {#each leistungenOptions as opt}
          <button
            type="button"
            class="bf-leistung-btn"
            class:is-active={selectedLeistungKey === opt.key}
            onclick={() => { selectedLeistungKey = opt.key; selectedSlot = null; days = []; }}
          >
            <span class="bf-leistung-name">{opt.name}</span>
            <span class="bf-leistung-sub">{opt.category}{opt.durationMin ? ` · ${opt.durationMin} Min.` : ''}</span>
          </button>
        {/each}
      </div>
      {#if !leistungenLoaded}
        <p class="bf-hint">Leistungen werden geladen…</p>
      {/if}
    </div>
  {/if}

  <!-- Step 3: Date + slot -->
  {#if showSlotSelection}
    <div class="bf-section">
      <p class="bf-step-label">Termin wählen</p>

      {#if loading}
        <p class="bf-hint bf-hint--center">Verfügbare Termine werden geladen…</p>
      {:else if slotLoadError}
        <p class="bf-hint bf-hint--center">Termine konnten nicht geladen werden. Bitte laden Sie die Seite neu oder kontaktieren Sie uns direkt.</p>
      {:else if days.length === 0}
        <p class="bf-hint bf-hint--center">Derzeit sind keine freien Termine verfügbar. Bitte kontaktieren Sie uns direkt.</p>
      {:else}
        <!-- Date strip -->
        <div class="bf-date-strip">
          {#each days as day}
            <button
              type="button"
              class="bf-date-btn"
              class:is-active={selectedDate === day.date}
              onclick={() => (selectedDate = day.date)}
            >
              <span class="bf-date-wd">{day.weekday}</span>
              <span class="bf-date-dt">{formatDate(day.date)}</span>
            </button>
          {/each}
        </div>

        <!-- Slot pills -->
        {#if currentDaySlots}
          <div class="bf-slots">
            {#each currentDaySlots.slots as slot}
              <button
                type="button"
                class="bf-slot"
                class:is-active={selectedSlot?.start === slot.start}
                onclick={() => selectSlot(slot)}
              >
                {formatSlotTime(slot.start, slot.end)}
              </button>
            {/each}
          </div>
        {/if}

        {#if selectedSlot}
          <p class="bf-slot-confirm" data-testid="selected-slot-display">
            <span class="bf-slot-confirm-dot" aria-hidden="true">·</span>
            Gewählt: {currentDaySlots?.weekday}, {formatDate(selectedDate)} · {formatSlotTime(selectedSlot.start, selectedSlot.end)}
          </p>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- Contact form -->
  {#if showContactForm}
    <form onsubmit={handleSubmit} class="bf-form">
      <div class="bf-form-head">
        <h3 class="bf-form-title">Ihre Angaben</h3>
        <span class="bf-form-req">* Pflichtfeld</span>
      </div>

      <div class="bf-field-row">
        <div class="bf-field">
          <label for="b-name" class="bf-label">Name <span class="bf-req">*</span></label>
          <input id="b-name" type="text" bind:value={name} required
            placeholder="Andrea Müller" class="bf-input" />
        </div>
        <div class="bf-field">
          <label for="b-email" class="bf-label">E-Mail <span class="bf-req">*</span></label>
          <input id="b-email" type="email" bind:value={email} required
            placeholder="ihre@email.de" class="bf-input" />
        </div>
      </div>

      <div class="bf-field-row">
        <div class="bf-field">
          <label for="b-phone" class="bf-label">
            Telefon
            {#if isCallback}<span class="bf-req"> *</span>{:else}<span class="bf-opt"> (optional)</span>{/if}
          </label>
          <input id="b-phone" type="tel" bind:value={phone}
            required={isCallback} placeholder="+49 …" class="bf-input" />
          {#if isCallback}<p class="bf-hint">Wir rufen Sie unter dieser Nummer zurück.</p>{/if}
        </div>
        <div class="bf-field">
          <label class="bf-label">Format</label>
          <div class="bf-format-group" role="radiogroup">
            <input type="radio" id="bf-f-online" name="bf-format" value="online" /><label for="bf-f-online">Online</label>
            <input type="radio" id="bf-f-vor-ort" name="bf-format" value="vor-ort" /><label for="bf-f-vor-ort">Vor Ort</label>
            <input type="radio" id="bf-f-egal" name="bf-format" value="egal" checked /><label for="bf-f-egal">Egal</label>
          </div>
        </div>
      </div>

      <div class="bf-field">
        <label for="b-message" class="bf-label">
          Worum geht es? <span class="bf-opt">(optional)</span>
        </label>
        <textarea id="b-message" bind:value={message} rows="3"
          placeholder="In zwei, drei Sätzen — was beschäftigt Sie gerade?"
          class="bf-input bf-textarea"></textarea>
      </div>

      {#if portalProjects.length > 0}
        <div class="bf-field">
          <label class="bf-label">Für welches Projekt? <span class="bf-opt">(optional)</span></label>
          <select bind:value={selectedProjectId} class="bf-input">
            <option value="">— Kein Projekt —</option>
            {#each portalProjects as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="bf-agb-row">
        <input id="b-agb" type="checkbox" bind:checked={agbAccepted} required class="bf-checkbox" />
        <label for="b-agb" class="bf-agb-label">
          Ich habe die <a href="/agb" target="_blank">AGB</a> gelesen und akzeptiere sie. <span class="bf-req">*</span>
        </label>
      </div>

      <div class="bf-submit-area">
        <button type="submit" disabled={submitting || !agbAccepted} class="bf-btn">
          {#if submitting}Wird gesendet…{:else}Termin vorschlagen →{/if}
        </button>
        <p class="bf-submit-note">
          Mit dem Absenden bestätigen Sie die <a href="/datenschutz">Datenschutzerklärung</a>.
        </p>
      </div>

      {#if result}
        <div class="bf-result" class:is-success={result.success} class:is-error={!result.success}>
          {result.message}
        </div>
      {/if}
    </form>
  {/if}

</div>

<style>
  .bf-root { display: flex; flex-direction: column; gap: 0; }

  .bf-section {
    padding: 28px 0;
    border-top: 1px solid var(--line);
  }
  .bf-section:first-child { border-top: none; padding-top: 0; }

  .bf-step-label {
    font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--mute); margin: 0 0 18px;
  }

  /* Type segment */
  .bf-type-row {
    display: flex; gap: 0;
    border: 1px solid var(--line-2);
    border-radius: 999px; padding: 4px; width: fit-content;
    flex-wrap: wrap;
  }
  .bf-type-btn {
    padding: 8px 18px; border-radius: 999px;
    background: transparent; border: none;
    color: var(--fg-soft); font-family: var(--sans); font-size: 13px;
    cursor: pointer; transition: all 200ms ease;
  }
  .bf-type-btn:hover { color: var(--fg); }
  .bf-type-btn.is-active { background: var(--brass); color: #1a130a; font-weight: 500; }

  /* Leistung buttons */
  .bf-leistung-row { display: flex; flex-direction: column; gap: 0; }
  .bf-leistung-btn {
    padding: 16px 0; background: transparent; border: none;
    border-bottom: 1px solid var(--line); text-align: left;
    cursor: pointer; transition: all 200ms ease; width: 100%;
  }
  .bf-leistung-btn:hover .bf-leistung-name { color: var(--fg); }
  .bf-leistung-btn.is-active .bf-leistung-name { color: var(--brass-2); }
  .bf-leistung-name { font-family: var(--serif); font-size: 18px; color: var(--fg-soft); display: block; }
  .bf-leistung-sub { font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--mute); margin-top: 4px; display: block; }

  /* Date strip */
  .bf-date-strip {
    display: flex; gap: 8px; overflow-x: auto;
    padding-bottom: 4px; margin-bottom: 24px;
  }
  .bf-date-btn {
    flex-shrink: 0; padding: 12px 16px;
    border: 1px solid var(--line-2); border-radius: 999px;
    background: transparent; text-align: center;
    cursor: pointer; transition: all 200ms ease;
    min-width: 88px;
  }
  .bf-date-btn:hover { border-color: var(--brass); }
  .bf-date-btn.is-active { background: var(--brass); border-color: var(--brass); }
  .bf-date-wd {
    font-family: var(--sans); font-size: 12px; font-weight: 500;
    color: var(--fg-soft); display: block;
  }
  .bf-date-btn.is-active .bf-date-wd,
  .bf-date-btn.is-active .bf-date-dt { color: #1a130a; }
  .bf-date-dt {
    font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em;
    color: var(--mute); margin-top: 3px; display: block;
  }

  /* Slot pills */
  .bf-slots { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
  .bf-slot {
    padding: 12px 10px; border: 1px solid var(--line-2);
    border-radius: 999px; background: transparent;
    color: var(--fg); font-family: var(--mono);
    font-size: 13px; letter-spacing: 0.04em;
    cursor: pointer; text-align: center;
    transition: all 200ms ease; min-width: 78px;
  }
  .bf-slot:hover { border-color: var(--brass); color: var(--brass-2); }
  .bf-slot.is-active { background: var(--brass); border-color: var(--brass); color: #1a130a; font-weight: 500; }

  .bf-slot-confirm {
    margin-top: 16px; font-family: var(--mono); font-size: 12px;
    letter-spacing: 0.08em; color: var(--brass); display: flex; align-items: center; gap: 10px;
  }
  .bf-slot-confirm-dot { color: var(--mute); }

  /* Form */
  .bf-form { display: flex; flex-direction: column; gap: 22px; padding-top: 4px; }
  .bf-form-head {
    display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  }
  .bf-form-title {
    font-family: var(--serif); font-weight: 400; font-size: 22px;
    letter-spacing: -0.01em; color: var(--fg); margin: 0;
  }
  .bf-form-req { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mute); }

  .bf-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  .bf-field { display: flex; flex-direction: column; gap: 8px; }

  .bf-label {
    font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--mute);
  }
  .bf-req { color: var(--brass); }
  .bf-opt { text-transform: none; letter-spacing: 0; font-family: var(--sans); font-size: 12px; color: var(--mute-2); }

  .bf-input {
    background: transparent; border: none;
    border-bottom: 1px solid var(--line-2);
    padding: 10px 0 12px; font-family: var(--sans); font-size: 16px;
    color: var(--fg); outline: none; width: 100%;
    transition: border-color 200ms ease;
  }
  .bf-input::placeholder { color: var(--mute-2); }
  .bf-input:focus { border-color: var(--brass); }
  .bf-textarea { resize: vertical; min-height: 72px; line-height: 1.55; }

  /* Format radio group */
  .bf-format-group {
    display: flex; gap: 0;
    border: 1px solid var(--line-2); border-radius: 999px;
    padding: 4px; width: fit-content; margin-top: 2px;
  }
  .bf-format-group input[type="radio"] { display: none; }
  .bf-format-group label {
    text-transform: none; letter-spacing: 0;
    font-family: var(--sans); font-size: 13px;
    color: var(--fg-soft); padding: 7px 16px;
    border-radius: 999px; cursor: pointer;
    transition: all 200ms ease;
  }
  .bf-format-group input:checked + label { background: var(--brass); color: #1a130a; font-weight: 500; }
  .bf-format-group label:hover { color: var(--fg); }

  /* AGB row */
  .bf-agb-row { display: flex; align-items: start; gap: 12px; }
  .bf-checkbox {
    width: 16px; height: 16px; margin-top: 2px; flex-shrink: 0;
    accent-color: var(--brass); cursor: pointer;
  }
  .bf-agb-label { font-size: 13px; color: var(--mute); line-height: 1.55; cursor: pointer; }
  .bf-agb-label a { color: var(--fg-soft); border-bottom: 1px solid var(--brass); text-decoration: none; padding-bottom: 1px; }
  .bf-agb-label a:hover { color: var(--brass-2); }

  /* Submit */
  .bf-submit-area { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .bf-btn {
    display: inline-flex; align-items: center; gap: 10px;
    background: var(--brass); color: #1a130a; border: none;
    padding: 15px 28px; border-radius: 999px;
    font-family: var(--sans); font-size: 15px; font-weight: 600;
    letter-spacing: -0.005em; cursor: pointer;
    transition: background 200ms ease, transform 200ms ease;
  }
  .bf-btn:hover:not(:disabled) { background: var(--brass-2); transform: translateY(-1px); }
  .bf-btn:disabled { background: var(--ink-800); color: var(--mute); cursor: not-allowed; }
  .bf-submit-note { font-size: 13px; color: var(--mute); max-width: 38ch; line-height: 1.5; }
  .bf-submit-note a { color: var(--fg-soft); border-bottom: 1px solid var(--brass); text-decoration: none; }
  .bf-submit-note a:hover { color: var(--brass-2); }

  /* Result */
  .bf-result { padding: 16px; font-size: 14px; line-height: 1.55; border-radius: 8px; }
  .bf-result.is-success { background: oklch(0.80 0.06 160 / .1); color: oklch(0.80 0.06 160); border: 1px solid oklch(0.80 0.06 160 / .25); }
  .bf-result.is-error { background: oklch(0.62 0.18 22 / .1); color: oklch(0.75 0.12 22); border: 1px solid oklch(0.62 0.18 22 / .25); }

  .bf-hint { font-size: 13px; color: var(--mute); line-height: 1.5; margin: 8px 0 0; }
  .bf-hint--center { text-align: center; padding: 32px 0; }

  @media (max-width: 640px) {
    .bf-field-row { grid-template-columns: 1fr; }
    .bf-type-row { flex-direction: column; border-radius: 12px; }
    .bf-type-btn { border-radius: 8px; }
  }
</style>
