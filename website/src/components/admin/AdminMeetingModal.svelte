<script lang="ts">
  // Admin "Neues Meeting" modal — used on /admin/meetings.
  // Closes T000161, T000164.
  interface ClientOption {
    id: string;
    name: string;
    email: string;
  }
  interface Project { id: string; name: string }

  let {
    projects = [],
    buttonLabel = '＋ Neues Meeting',
  }: {
    projects?: Project[];
    buttonLabel?: string;
  } = $props();

  let open = $state(false);
  let submitting = $state(false);
  let error = $state('');
  let success = $state('');

  let clients = $state<ClientOption[]>([]);
  let clientsLoaded = $state(false);
  let clientSearch = $state('');
  let selectedClient = $state<ClientOption | null>(null);

  // Allow free-form attendee entry too (some meetings are with external folks).
  let manualName = $state('');
  let manualEmail = $state('');

  let title = $state('');
  let projectId = $state('');
  let meetingDate = $state('');
  let meetingTime = $state('10:00');
  let durationMinutes = $state(60);
  const DURATIONS = [15, 30, 45, 60, 90, 120];

  const filteredClients = $derived(
    clientSearch.length < 1
      ? clients
      : clients.filter(
          c =>
            c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
            c.email.toLowerCase().includes(clientSearch.toLowerCase())
        )
  );

  function openModal() {
    open = true;
    resetForm();
    if (!clientsLoaded) loadClients();
  }
  function closeModal() {
    if (submitting) return;
    open = false;
  }
  function resetForm() {
    selectedClient = null;
    clientSearch = '';
    manualName = '';
    manualEmail = '';
    title = '';
    projectId = '';
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
    meetingDate = tomorrow.toISOString().split('T')[0];
    meetingTime = '10:00';
    durationMinutes = 60;
    error = '';
    success = '';
  }

  async function loadClients() {
    try {
      const res = await fetch('/api/admin/clients-list');
      if (res.ok) clients = await res.json();
    } catch {
      // bleibt leer
    } finally {
      clientsLoaded = true;
    }
  }

  async function submit() {
    error = '';
    const customerName = (selectedClient?.name ?? manualName).trim();
    const customerEmail = (selectedClient?.email ?? manualEmail).trim();
    if (!customerName) { error = 'Teilnehmer-Name ist Pflicht.'; return; }
    if (!customerEmail) { error = 'Teilnehmer-E-Mail ist Pflicht.'; return; }
    if (!meetingDate || !meetingTime) { error = 'Datum + Uhrzeit sind Pflicht.'; return; }

    const [h, m] = meetingTime.split(':').map(Number);
    const dt = new Date(meetingDate);
    dt.setHours(h, m, 0, 0);
    if (Number.isNaN(dt.getTime())) {
      error = 'Datum/Uhrzeit ungültig.';
      return;
    }

    submitting = true;
    try {
      const res = await fetch('/api/admin/meetings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerEmail,
          meetingType: title.trim() || 'Meeting',
          scheduledAt: dt.toISOString(),
          durationMinutes,
          projectId: projectId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        error = data.error ?? 'Unbekannter Fehler.';
        submitting = false;
        return;
      }
      success = data.calendarPersisted
        ? 'Meeting angelegt und im Kalender eingetragen.'
        : 'Meeting angelegt (Kalendereintrag fehlgeschlagen).';
      submitting = false;
      document.dispatchEvent(new CustomEvent('admin-meeting-created'));
      setTimeout(() => {
        closeModal();
        // refresh page so the new meeting appears in the list
        window.location.reload();
      }, 1200);
    } catch {
      error = 'Netzwerkfehler.';
      submitting = false;
    }
  }
</script>

<button
  onclick={openModal}
  data-testid="admin-meeting-new"
  class="px-4 py-2 bg-gold text-dark text-sm font-semibold rounded-lg hover:bg-gold/90 transition-colors"
>
  {buttonLabel}
</button>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
  >
    <div class="w-full max-w-lg bg-dark rounded-2xl border border-dark-lighter shadow-2xl overflow-hidden">
      <div class="flex items-center justify-between px-6 py-4 border-b border-dark-lighter">
        <h2 class="text-lg font-bold text-light font-serif">Neues Meeting</h2>
        <button onclick={closeModal} class="text-muted hover:text-light transition-colors text-xl leading-none">✕</button>
      </div>

      <div class="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
        {#if error}
          <div class="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
        {/if}
        {#if success}
          <div class="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">{success}</div>
        {/if}

        <div>
          <label for="meeting-title" class="block text-xs text-muted uppercase tracking-wide mb-1">Titel</label>
          <input
            id="meeting-title"
            type="text"
            bind:value={title}
            placeholder="z.B. Kennenlern-Termin, Strategie, Coaching…"
            class="w-full bg-dark-light border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
          />
        </div>

        <div>
          <span class="block text-xs text-muted uppercase tracking-wide mb-1">Teilnehmer</span>
          {#if selectedClient}
            <div class="flex items-center gap-2 px-3 py-2 bg-dark-light border border-gold/40 rounded-lg text-sm">
              <span class="text-light flex-1">{selectedClient.name} <span class="text-muted">· {selectedClient.email}</span></span>
              <button onclick={() => { selectedClient = null; clientSearch = ''; }} class="text-muted hover:text-light text-xs">✕</button>
            </div>
          {:else}
            <input
              type="text"
              placeholder="Bestehenden Client suchen (Name oder E-Mail)…"
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
            <div class="mt-2 grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="oder Name"
                bind:value={manualName}
                class="bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
              />
              <input
                type="email"
                placeholder="oder E-Mail"
                bind:value={manualEmail}
                class="bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
              />
            </div>
          {/if}
        </div>

        {#if projects.length > 0}
          <div>
            <label for="meeting-project" class="block text-xs text-muted uppercase tracking-wide mb-1">Projekt <span class="normal-case text-muted/60">(optional)</span></label>
            <select id="meeting-project" bind:value={projectId}
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none">
              <option value="">— Kein Projekt —</option>
              {#each projects as p}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="meeting-date" class="block text-xs text-muted uppercase tracking-wide mb-1">Datum</label>
            <input id="meeting-date" type="date" bind:value={meetingDate}
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none" />
          </div>
          <div>
            <label for="meeting-time" class="block text-xs text-muted uppercase tracking-wide mb-1">Uhrzeit</label>
            <input id="meeting-time" type="time" bind:value={meetingTime}
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none" />
          </div>
        </div>

        <div>
          <label for="meeting-duration" class="block text-xs text-muted uppercase tracking-wide mb-1">Dauer</label>
          <select id="meeting-duration" bind:value={durationMinutes}
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none">
            {#each DURATIONS as d}
              <option value={d}>{d} Minuten</option>
            {/each}
          </select>
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
          {submitting ? '…' : 'Meeting anlegen'}
        </button>
      </div>
    </div>
  </div>
{/if}
