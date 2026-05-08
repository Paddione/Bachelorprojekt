<script lang="ts">
  import type { LiveCockpitData } from '../../lib/live-state';
  import ScheduleNudge from './shared/ScheduleNudge.svelte';

  let { data }: { data: LiveCockpitData } = $props();

  function fmtDate(d: Date | string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtTime(d: Date | string | null) {
    if (!d) return '';
    return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div data-testid="cockpit-launchpad" class="space-y-8">
  {#if data.schedule.nextEvent}
    <ScheduleNudge event={data.schedule.nextEvent} />
  {/if}

  <div class="grid md:grid-cols-2 gap-4">
    <a href="/admin/live?force=stream"
       class="bg-dark-light border border-dark-lighter rounded-2xl p-6 hover:border-gold transition-colors block">
      <div class="text-3xl mb-2">📡</div>
      <h2 class="text-lg font-serif text-light mb-1">Stream starten</h2>
      <p class="text-sm text-muted">Browser oder OBS → live an web.&lt;brand&gt;.de/portal/stream</p>
    </a>

    <a href="/talk-call"
       class="bg-dark-light border border-dark-lighter rounded-2xl p-6 hover:border-gold transition-colors block">
      <div class="text-3xl mb-2">🎙</div>
      <h2 class="text-lg font-serif text-light mb-1">Talk-Call starten</h2>
      <p class="text-sm text-muted">In Nextcloud Talk eröffnen — taucht hier automatisch auf, sobald jemand drin ist.</p>
    </a>
  </div>

  <section>
    <h2 class="text-xs uppercase tracking-wide text-muted mb-3">Letzte Sessions</h2>
    {#if data.recentSessions.length === 0}
      <p class="text-muted text-sm">Noch keine aufgezeichneten Sessions.</p>
    {:else}
      <ul class="space-y-1">
        {#each data.recentSessions as m}
          <li>
            <a href={`/admin/live/sessions/${m.id}`}
               class="block bg-dark-light border border-dark-lighter rounded-lg px-4 py-2 hover:border-gold/40 flex items-center gap-4">
              <span class="text-xs font-mono text-muted">{fmtDate(m.startedAt ?? m.createdAt)} {fmtTime(m.startedAt ?? m.createdAt)}</span>
              <span class="text-sm text-light flex-1 truncate">{m.customerName}</span>
              <span class="text-xs text-muted">{m.meetingType}</span>
              {#if m.hasTranscript}<span class="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">📝</span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
