<script lang="ts">
  import type { ScheduleHint } from '../../../lib/live-state';

  let { event }: { event: ScheduleHint | null } = $props();

  function minutesUntil(iso: string): number {
    return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  }
</script>

{#if event}
  <div data-testid="schedule-nudge"
       class="bg-gold/10 border border-gold/30 rounded-2xl p-4 flex items-center justify-between">
    <div>
      <p class="text-sm text-light"><strong>{event.label}</strong> — in {minutesUntil(event.startsAt)} Min</p>
    </div>
    {#if event.talkRoomToken}
      <a href={`/talk-call/${event.talkRoomToken}`}
         class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold">
        Jetzt starten →
      </a>
    {/if}
  </div>
{/if}
