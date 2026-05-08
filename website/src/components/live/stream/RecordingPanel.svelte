<script lang="ts">
  let egressId = $state<string | null>(null);
  let status = $state<{ kind: 'idle' | 'running' | 'err'; text: string }>({ kind: 'idle', text: '' });
  let busy = $state(false);
  let startedAt = $state<number | null>(null);
  let elapsed = $state('00:00');

  $effect(() => {
    if (!startedAt) return;
    const t = setInterval(() => {
      const ms = Date.now() - startedAt!;
      const s = Math.floor(ms / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      elapsed = `${mm}:${ss}`;
    }, 1000);
    return () => clearInterval(t);
  });

  async function toggle() {
    busy = true;
    try {
      if (!egressId) {
        const res = await fetch('/api/stream/recording', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' }),
        });
        const data = await res.json() as { egressId?: string; error?: string };
        if (!res.ok || !data.egressId) {
          status = { kind: 'err', text: data.error ?? 'Aufzeichnung konnte nicht gestartet werden.' };
          return;
        }
        egressId = data.egressId;
        startedAt = Date.now();
        status = { kind: 'running', text: 'Aufzeichnung läuft' };
      } else {
        const res = await fetch('/api/stream/recording', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop', egressId }),
        });
        if (!res.ok) {
          status = { kind: 'err', text: 'Stoppen fehlgeschlagen.' };
          return;
        }
        egressId = null;
        startedAt = null;
        elapsed = '00:00';
        status = { kind: 'idle', text: 'Gespeichert in /recordings/' };
      }
    } finally { busy = false; }
  }
</script>

<div class="bg-dark-light border border-dark-lighter rounded-xl p-5">
  <h2 class="text-sm font-semibold text-light mb-3">Aufzeichnung</h2>
  <div class="flex items-center gap-4">
    <button onclick={toggle} disabled={busy}
      class={egressId
        ? 'px-4 py-2 rounded-lg text-sm font-semibold border border-red-500 text-red-400 disabled:opacity-50'
        : 'px-4 py-2 rounded-lg text-sm font-semibold bg-dark border border-dark-lighter text-light hover:border-gold disabled:opacity-50'}>
      {egressId ? '⏹ Aufzeichnung stoppen' : '● Aufzeichnung starten'}
    </button>
    <span class="text-sm" class:text-red-400={status.kind==='err'} class:text-muted={status.kind!=='err'}>
      {status.text} {egressId ? `· ${elapsed}` : ''}
    </span>
  </div>
</div>
