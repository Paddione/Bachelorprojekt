<script lang="ts">
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
  }
  let { initialDate = '', initialStart = '', initialEnd = '' } = $props<Props>();

  let name = $state('');
  let email = $state('');
  let phone = $state('');
  let bookingType = $state('erstgespraech');
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

  const bookingTypes = [
    { value: 'erstgespraech', label: 'Kostenloses Erstgespräch (30 Min.)' },
    { value: 'callback', label: 'Rückruf' },
    { value: 'meeting', label: 'Online-Meeting' },
    { value: 'termin', label: 'Termin vor Ort' },
  ];

  // Fetch available slots on mount
  if (typeof window !== 'undefined') {
    fetch('/api/calendar/slots')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          days = data;
          if (!initialDate && data.length > 0) selectedDate = data[0].date;
        }
        loading = false;
      })
      .catch(() => {
        loading = false;
      });
  }

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
    if (!selectedSlot) return;
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
          slotStart: selectedSlot.start,
          slotEnd: selectedSlot.end,
          slotDisplay: selectedSlot.display,
          date: selectedDate,
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
      } else {
        result = { success: false, message: data.error || 'Es ist ein Fehler aufgetreten.' };
      }
    } catch {
      result = { success: false, message: 'Verbindungsfehler. Bitte versuchen Sie es spater erneut.' };
    } finally {
      submitting = false;
    }
  }

  let currentDaySlots = $derived(days.find((d) => d.date === selectedDate));
</script>

<div class="space-y-8">
  <!-- Step 1: Choose type -->
  <div>
    <h3 class="text-xl font-semibold text-light mb-4">1. Art des Termins</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {#each bookingTypes as bt}
        <button
          type="button"
          class="p-4 rounded-xl border text-left transition-all {bookingType === bt.value
            ? 'border-gold bg-gold-dim text-gold'
            : 'border-dark-lighter bg-dark hover:border-gold/30 text-muted'}"
          onclick={() => (bookingType = bt.value)}
        >
          {bt.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Step 2: Choose date + slot -->
  <div>
    <h3 class="text-xl font-semibold text-light mb-4">2. Termin wahlen</h3>

    {#if loading}
      <div class="text-muted py-8 text-center">Verfugbare Termine werden geladen...</div>
    {:else if days.length === 0}
      <div class="text-muted py-8 text-center bg-dark rounded-xl border border-dark-lighter">
        Derzeit sind keine freien Termine verfugbar. Bitte kontaktieren Sie uns direkt.
      </div>
    {:else}
      <!-- Date tabs -->
      <div class="flex gap-2 overflow-x-auto pb-2 mb-4">
        {#each days as day}
          <button
            type="button"
            class="flex-shrink-0 px-4 py-3 rounded-xl border text-center transition-all min-w-[100px] {selectedDate === day.date
              ? 'border-gold bg-gold-dim text-gold'
              : 'border-dark-lighter bg-dark hover:border-gold/30 text-muted'}"
            onclick={() => (selectedDate = day.date)}
          >
            <div class="text-sm font-medium">{day.weekday}</div>
            <div class="text-xs mt-1">{formatDate(day.date)}</div>
          </button>
        {/each}
      </div>

      <!-- Time slots for selected date -->
      {#if currentDaySlots}
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {#each currentDaySlots.slots as slot}
            <button
              type="button"
              class="px-4 py-3 rounded-xl border text-center font-medium transition-all {selectedSlot?.start === slot.start
                ? 'border-gold bg-gold text-dark'
                : 'border-dark-lighter bg-dark hover:border-gold/30 text-muted hover:text-light'}"
              onclick={() => selectSlot(slot)}
            >
              {slot.display}
            </button>
          {/each}
        </div>
      {/if}

      {#if selectedSlot}
        <p class="mt-4 text-gold font-medium" data-testid="selected-slot-display">
          Gewahlt: {currentDaySlots?.weekday}, {formatDate(selectedDate)} um {selectedSlot.display}
        </p>
      {/if}
    {/if}
  </div>

  <!-- Step 3: Contact details -->
  {#if selectedSlot}
    <form onsubmit={handleSubmit} class="space-y-6">
      <h3 class="text-xl font-semibold text-light">3. Ihre Kontaktdaten</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label for="b-name" class="block text-lg font-medium text-light mb-2">
            Ihr Name <span class="text-gold">*</span>
          </label>
          <input
            id="b-name"
            type="text"
            bind:value={name}
            required
            placeholder="Max Mustermann"
            class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
          />
        </div>
        <div>
          <label for="b-email" class="block text-lg font-medium text-light mb-2">
            E-Mail <span class="text-gold">*</span>
          </label>
          <input
            id="b-email"
            type="email"
            bind:value={email}
            required
            placeholder="max@beispiel.de"
            class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
          />
        </div>
      </div>

      <div>
        <label for="b-phone" class="block text-lg font-medium text-light mb-2">
          Telefon <span class="text-muted-dark">(optional)</span>
        </label>
        <input
          id="b-phone"
          type="tel"
          bind:value={phone}
          placeholder="+49 ..."
          class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
        />
      </div>

      <div>
        <label for="b-message" class="block text-lg font-medium text-light mb-2">
          Anmerkungen <span class="text-muted-dark">(optional)</span>
        </label>
        <textarea
          id="b-message"
          bind:value={message}
          rows="3"
          placeholder="Worum geht es? Was sollen wir vorbereiten?"
          class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors resize-y"
        ></textarea>
      </div>

      <button
        type="submit"
        disabled={submitting}
        class="w-full bg-gold hover:bg-gold-light disabled:bg-dark-lighter disabled:text-muted-dark text-dark px-8 py-4 rounded-full font-bold text-lg transition-colors cursor-pointer disabled:cursor-not-allowed uppercase tracking-wide"
      >
        {#if submitting}
          Wird gesendet...
        {:else}
          Termin anfragen
        {/if}
      </button>

      {#if result}
        <div
          class="p-4 rounded-lg text-lg {result.success
            ? 'bg-green-900/30 text-green-300 border border-green-800'
            : 'bg-red-900/30 text-red-300 border border-red-800'}"
        >
          {result.message}
        </div>
      {/if}
    </form>
  {/if}
</div>
