<script lang="ts">
  let year = new Date().getFullYear();
  let month: number | '' = new Date().getMonth() + 1; // current month default
  let emailTo = '';
  let status: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let statusMsg = '';

  const MONTHS = [
    { v: '', label: 'Ganzes Jahr' },
    { v: 1,  label: 'Januar' }, { v: 2, label: 'Februar' }, { v: 3, label: 'März' },
    { v: 4,  label: 'April' },  { v: 5, label: 'Mai' },     { v: 6, label: 'Juni' },
    { v: 7,  label: 'Juli' },   { v: 8, label: 'August' },  { v: 9, label: 'September' },
    { v: 10, label: 'Oktober' },{ v: 11, label: 'November'},{ v: 12, label: 'Dezember' },
  ];

  function downloadUrl(): string {
    const p = new URLSearchParams({ year: String(year) });
    if (month !== '') p.set('month', String(month));
    return `/api/admin/billing/datev-export?${p}`;
  }

  async function sendEmail() {
    if (!emailTo.trim()) { statusMsg = 'Bitte E-Mail-Adresse eingeben.'; status = 'error'; return; }
    status = 'loading';
    statusMsg = '';
    try {
      const res = await fetch('/api/admin/billing/datev-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month: month !== '' ? month : undefined, to: emailTo.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Fehler');
      const data = await res.json();
      statusMsg = `${data.count} Buchung${data.count !== 1 ? 'en' : ''} gesendet an ${data.to}`;
      status = 'success';
    } catch (err: any) {
      statusMsg = err.message ?? 'Unbekannter Fehler';
      status = 'error';
    }
  }
</script>

<div class="border border-dark-lighter rounded-xl p-6 bg-dark-lighter/30 mb-8">
  <h2 class="text-lg font-semibold text-light mb-4">DATEV Export (Buchungsstapel)</h2>

  <div class="flex flex-wrap gap-4 items-end mb-4">
    <div>
      <label class="block text-xs text-muted mb-1">Jahr</label>
      <select bind:value={year} class="bg-dark border border-dark-lighter rounded px-3 py-2 text-light text-sm">
        {#each [2024, 2025, 2026, 2027] as y}
          <option value={y}>{y}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="block text-xs text-muted mb-1">Monat</label>
      <select bind:value={month} class="bg-dark border border-dark-lighter rounded px-3 py-2 text-light text-sm">
        {#each MONTHS as m}
          <option value={m.v}>{m.label}</option>
        {/each}
      </select>
    </div>
    <a
      href={downloadUrl()}
      download
      class="inline-flex items-center gap-2 px-4 py-2 bg-brass/20 hover:bg-brass/30 border border-brass/40 text-brass rounded-lg text-sm font-medium transition-colors"
    >
      ↓ CSV herunterladen
    </a>
  </div>

  <div class="flex flex-wrap gap-3 items-end border-t border-dark-lighter pt-4">
    <div class="flex-1 min-w-[220px]">
      <label class="block text-xs text-muted mb-1">Steuerberater E-Mail</label>
      <input
        type="email"
        bind:value={emailTo}
        placeholder="stb@kanzlei.de"
        class="w-full bg-dark border border-dark-lighter rounded px-3 py-2 text-light text-sm placeholder:text-muted"
      />
    </div>
    <button
      on:click={sendEmail}
      disabled={status === 'loading'}
      class="px-4 py-2 bg-green-800/30 hover:bg-green-800/50 border border-green-700/40 text-green-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
    >
      {status === 'loading' ? 'Sendet…' : '✉ An Steuerberater senden'}
    </button>
  </div>

  {#if statusMsg}
    <p class="mt-3 text-sm {status === 'error' ? 'text-red-400' : 'text-green-400'}">
      {statusMsg}
    </p>
  {/if}
</div>
