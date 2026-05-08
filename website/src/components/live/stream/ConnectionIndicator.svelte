<script lang="ts">
  import type { Room } from 'livekit-client';
  import { ConnectionQuality } from 'livekit-client';

  let { room }: { room: Room | null } = $props();

  let quality = $state<ConnectionQuality>(ConnectionQuality.Unknown);

  $effect(() => {
    if (!room) return;
    const handler = (q: ConnectionQuality) => { quality = q; };
    room.on('connectionQualityChanged', handler);
    return () => { room.off('connectionQualityChanged', handler); };
  });

  const labels: Record<ConnectionQuality, { text: string; color: string }> = {
    [ConnectionQuality.Excellent]: { text: '● Ausgezeichnet', color: 'text-green-400' },
    [ConnectionQuality.Good]:      { text: '● Gut',           color: 'text-green-400' },
    [ConnectionQuality.Poor]:      { text: '● Wackelig',      color: 'text-yellow-400' },
    [ConnectionQuality.Lost]:      { text: '● Abgebrochen',   color: 'text-red-400' },
    [ConnectionQuality.Unknown]:   { text: '○ Unbekannt',     color: 'text-muted' },
  };
</script>

<span class={`text-xs font-mono ${labels[quality].color}`} data-testid="connection-indicator">
  {labels[quality].text}
</span>
