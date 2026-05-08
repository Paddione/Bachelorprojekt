<script lang="ts">
  type TrRoom = { token: string; displayName: string };

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  let rooms = $state<TrRoom[]>([]);
  let activeSessions = $state<string[]>([]);
  let intro = $state('Lade laufende Calls…');
  let result = $state<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    intro = 'Lade laufende Calls…'; rooms = []; result = null;
    try {
      const res = await fetch('/api/admin/transcription');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { rooms: TrRoom[]; activeSessions: string[] };
      rooms = data.rooms ?? []; activeSessions = data.activeSessions ?? [];
      intro = rooms.length === 0 ? 'Aktuell läuft kein Talk-Call.' : `${rooms.length} laufende(r) Call(s) — Transkription steuern:`;
    } catch { intro = 'Fehler beim Laden der Calls.'; }
  }
  $effect(() => { if (open) load(); });

  async function toggle(token: string, action: 'start' | 'stop') {
    const res = await fetch('/api/admin/transcription', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    });
    if (res.ok) {
      activeSessions = action === 'start'
        ? [...activeSessions.filter(t => t !== token), token]
        : activeSessions.filter(t => t !== token);
    }
  }
  async function startAll() {
    const inactive = rooms.filter(r => !activeSessions.includes(r.token));
    const started = await Promise.all(inactive.map(r =>
      fetch('/api/admin/transcription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: r.token, action: 'start' }),
      }).then(res => res.ok ? r.token : null)
    ));
    const ok = started.filter(Boolean) as string[];
    activeSessions = [...new Set([...activeSessions, ...ok])];
    if (ok.length > 0) result = { kind: 'ok', text: `✓ Transkription für ${ok.length} Call(s) gestartet.` };
  }

  let inactiveCount = $derived(rooms.filter(r => !activeSessions.includes(r.token)).length);
</script>

{#if open}
  <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
       onclick={(e) => { if (e.currentTarget === e.target) onclose(); }} role="presentation">
    <div class="bg-dark-light rounded-2xl border border-dark-lighter max-w-lg w-full p-6 shadow-xl">
      <h2 class="text-xl font-serif text-light mb-2">🎙 Transkription</h2>
      <p class="text-sm text-muted mb-4">{intro}</p>

      <ul class="max-h-64 overflow-y-auto space-y-1 mb-5 text-sm text-light">
        {#each rooms as r (r.token)}
          {@const isActive = activeSessions.includes(r.token)}
          <li class="flex items-center justify-between px-3 py-2 bg-dark rounded border border-dark-lighter gap-3">
            <span class="flex-1 truncate">{r.displayName || r.token}</span>
            <span class={isActive
              ? 'text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-400/20'
              : 'text-xs px-1.5 py-0.5 rounded bg-dark-lighter text-muted border border-dark-lighter'}>
              {isActive ? '🟢 Aktiv' : '⚫ Inaktiv'}
            </span>
            <button onclick={() => toggle(r.token, isActive ? 'stop' : 'start')}
              class={isActive ? 'px-2 py-1 text-xs rounded border border-red-400/30 text-red-400 hover:bg-red-400/10'
                              : 'px-2 py-1 text-xs rounded border border-gold/30 text-gold hover:bg-gold/10'}>
              {isActive ? 'Stop' : 'Start'}
            </button>
          </li>
        {/each}
      </ul>

      {#if result}<p class="mb-4 text-sm text-green-400">{result.text}</p>{/if}

      <div class="flex justify-end gap-2">
        <button onclick={onclose} class="px-4 py-2 bg-dark rounded-lg border border-dark-lighter text-sm text-muted hover:text-light">Schließen</button>
        <button onclick={startAll} disabled={inactiveCount===0}
          class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold disabled:opacity-40">
          {inactiveCount > 0 ? `▶ Alle starten (${inactiveCount})` : '✓ Alle aktiv'}
        </button>
      </div>
    </div>
  </div>
{/if}
