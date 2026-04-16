<script lang="ts">
  import ContactForm from './ContactForm.svelte';
  import BookingForm from './BookingForm.svelte';

  interface Props {
    initialMode?: 'message' | 'termin' | 'callback' | null;
    initialServiceKey?: string;
  }
  let { initialMode = null, initialServiceKey } = $props<Props>();

  let activeMode = $state<'message' | 'termin' | 'callback' | null>(initialMode);

  function setMode(mode: 'message' | 'termin' | 'callback') {
    activeMode = activeMode === mode ? null : mode;
  }

  const tiles: Array<{ id: 'message' | 'termin' | 'callback'; icon: string; label: string; sub: string }> = [
    { id: 'message',  icon: '✉️', label: 'Nachricht schreiben', sub: 'Schildern Sie Ihr Anliegen' },
    { id: 'termin',   icon: '📅', label: 'Termin buchen',       sub: 'Erstgespräch oder Meeting' },
    { id: 'callback', icon: '📞', label: 'Rückruf anfragen',    sub: 'Wir melden uns bei Ihnen' },
  ];
</script>

<div>
  <!-- Tiles -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
    {#each tiles as tile}
      <button
        type="button"
        onclick={() => setMode(tile.id)}
        aria-expanded={activeMode === tile.id}
        class="text-left p-5 rounded-xl border transition-all cursor-pointer
          {activeMode === tile.id
            ? 'border-gold bg-gold/10'
            : 'border-dark-lighter bg-dark hover:border-gold/40'}"
      >
        <span class="text-2xl block mb-2" aria-hidden="true">{tile.icon}</span>
        <span class="font-semibold text-light block text-sm">{tile.label}</span>
        <span class="text-xs text-muted block mt-1">{tile.sub}</span>
      </button>
    {/each}
  </div>

  <!-- Accordion form area -->
  {#if activeMode === 'message'}
    <div class="bg-dark-light rounded-xl border border-dark-lighter p-6">
      <ContactForm />
    </div>
  {:else if activeMode === 'termin'}
    <div class="bg-dark-light rounded-xl border border-dark-lighter p-6">
      <BookingForm initialType="erstgespraech" serviceKey={initialServiceKey} />
    </div>
  {:else if activeMode === 'callback'}
    <div class="bg-dark-light rounded-xl border border-dark-lighter p-6">
      <BookingForm initialType="callback" serviceKey={initialServiceKey} />
    </div>
  {/if}
</div>
