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

  let {
    useCustomTime = $bindable(false),
    customDate = $bindable(''),
    customStartTime = $bindable('09:00'),
    customDurationMin = $bindable(60),
    daySlots = [],
    slotsLoaded = false,
    slotsError = '',
    selectedDate = $bindable(''),
    selectedSlot = $bindable(null),
  }: {
    useCustomTime: boolean;
    customDate: string;
    customStartTime: string;
    customDurationMin: number;
    daySlots: DaySlots[];
    slotsLoaded: boolean;
    slotsError: string;
    selectedDate: string;
    selectedSlot: TimeSlot | null;
  } = $props();

  const DURATIONS = [15, 30, 45, 60, 90, 120];

  const customEndTime = $derived(() => {
    if (!customDate || !customStartTime) return '';
    const [h, m] = customStartTime.split(':').map(Number);
    const end = new Date(customDate);
    end.setHours(h, m + customDurationMin, 0, 0);
    return `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
  });

  const slotsForDate = $derived(
    daySlots.find(d => d.date === selectedDate)?.slots ?? []
  );

  const availableDates = $derived(
    daySlots.filter(d => d.slots.length > 0).map(d => d.date)
  );
</script>

<div class="flex gap-3 text-sm mb-1">
  <label class="flex items-center gap-1.5 cursor-pointer">
    <input type="radio" bind:group={useCustomTime} value={false} class="accent-gold" />
    <span class="text-light">Aus freien Slots</span>
  </label>
  <label class="flex items-center gap-1.5 cursor-pointer">
    <input type="radio" bind:group={useCustomTime} value={true} class="accent-gold" />
    <span class="text-light">Freier Termin</span>
  </label>
</div>

{#if useCustomTime}
  <div class="grid grid-cols-2 gap-3">
    <div>
      <label class="block text-xs text-muted uppercase tracking-wide mb-1">Datum</label>
      <input type="date" bind:value={customDate}
        class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none" />
    </div>
    <div>
      <label class="block text-xs text-muted uppercase tracking-wide mb-1">Startzeit</label>
      <input type="time" bind:value={customStartTime}
        class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none" />
    </div>
  </div>
  <div>
    <label class="block text-xs text-muted uppercase tracking-wide mb-1">Dauer</label>
    <select bind:value={customDurationMin}
      class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none">
      {#each DURATIONS as d}
        <option value={d}>{d} Minuten{customDate && customStartTime ? ` (bis ${customEndTime()})` : ''}</option>
      {/each}
    </select>
  </div>
{:else}
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
