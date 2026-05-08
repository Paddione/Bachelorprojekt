<script lang="ts">
  let seeding  = false;
  let purging  = false;
  let message: { text: string; kind: 'ok' | 'warn' | 'error' } | null = null;
  let confirmOpen = false;
  let msgTimer: ReturnType<typeof setTimeout>;

  function showMessage(text: string, kind: 'ok' | 'warn' | 'error') {
    message = { text, kind };
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { message = null; }, 5000);
  }

  async function seed() {
    seeding = true;
    message = null;
    try {
      const res = await fetch('/api/admin/testdata/seed', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || 'Fehler beim Generieren', 'error');
      } else {
        const c = data.created;
        showMessage(
          `Erstellt: ${c.customers} Clients, ${c.invoices} Rechnungen, ${c.meetings} Meetings, ${c.bookings} Buchungen`,
          'ok'
        );
      }
    } catch {
      showMessage('Netzwerkfehler', 'error');
    } finally {
      seeding = false;
    }
  }

  async function purge() {
    confirmOpen = false;
    purging = true;
    message = null;
    try {
      const res = await fetch('/api/admin/testdata/purge', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        showMessage(data.error || 'Fehler beim Löschen', 'error');
      } else {
        const d = data.deleted;
        const skipped = data.skipped?.lockedInvoices ?? 0;
        const summary = `Gelöscht: ${d.customers} Clients, ${d.invoices} Rechnungen, ${d.meetings} Meetings, ${d.bookings} Buchungen`;
        showMessage(
          skipped > 0 ? `${summary} — ${skipped} gesperrte Rechnungen übersprungen` : summary,
          skipped > 0 ? 'warn' : 'ok'
        );
      }
    } catch {
      showMessage('Netzwerkfehler', 'error');
    } finally {
      purging = false;
    }
  }
</script>

<div class="bg-gray-800 rounded-lg p-5 space-y-4">
  <div>
    <h3 class="text-sm font-semibold text-gray-100">Testdaten</h3>
    <p class="text-xs text-gray-400 mt-1">
      Erzeugt <code class="text-gray-300">[TEST]</code>-Datensätze für Clients, Rechnungen, Meetings und Termine.
      Alle Testdaten können auf Knopfdruck vollständig entfernt werden.
    </p>
  </div>

  <div class="flex gap-3 flex-wrap">
    <button
      on:click={seed}
      disabled={seeding || purging}
      class="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500
             disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
    >
      {#if seeding}
        <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      {/if}
      Testdaten generieren
    </button>

    <button
      on:click={() => { confirmOpen = true; }}
      disabled={seeding || purging}
      class="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-red-700 hover:bg-red-600
             disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
    >
      {#if purging}
        <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      {/if}
      Alle [TEST]-Daten löschen
    </button>
  </div>

  {#if message}
    <p class="text-xs px-3 py-2 rounded {
      message.kind === 'ok'    ? 'bg-green-900 text-green-300' :
      message.kind === 'warn'  ? 'bg-yellow-900 text-yellow-300' :
                                 'bg-red-900 text-red-300'
    }">
      {message.text}
    </p>
  {/if}
</div>

<!-- Confirmation modal -->
{#if confirmOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true">
    <div class="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 space-y-4 shadow-xl">
      <h4 class="text-sm font-semibold text-gray-100">Testdaten löschen?</h4>
      <p class="text-xs text-gray-400">
        Alle Datensätze mit <code class="text-gray-300">[TEST]</code>-Präfix werden unwiderruflich gelöscht.
        Gesperrte Rechnungen werden übersprungen und als Warnung gemeldet.
      </p>
      <div class="flex gap-3 justify-end">
        <button
          on:click={() => { confirmOpen = false; }}
          class="px-4 py-2 rounded text-sm text-gray-300 hover:text-white transition-colors"
        >
          Abbrechen
        </button>
        <button
          on:click={purge}
          class="px-4 py-2 rounded text-sm font-medium bg-red-700 hover:bg-red-600 text-white transition-colors"
        >
          Löschen
        </button>
      </div>
    </div>
  </div>
{/if}
