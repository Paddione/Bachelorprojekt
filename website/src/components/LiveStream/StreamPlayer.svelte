<!-- website/src/components/LiveStream/StreamPlayer.svelte -->
<script lang="ts">
  import { Room, RoomEvent, Track } from 'livekit-client';
  import StreamOffline from './StreamOffline.svelte';
  import StreamChat from './StreamChat.svelte';
  import StreamReactions from './StreamReactions.svelte';
  import StreamHandRaise from './StreamHandRaise.svelte';

  let { livekitUrl, isHost = false }: { livekitUrl: string; isHost?: boolean } = $props();

  type State = 'loading' | 'offline' | 'live' | 'error';
  let state = $state<State>('loading');
  let errorMsg = $state('');
  let room = $state<Room | null>(null);
  let videoEl: HTMLVideoElement;

  $effect(() => {
    let mounted = true;

    async function connect() {
      try {
        const res = await fetch('/api/stream/token', { method: 'POST' });
        if (!res.ok) { state = 'error'; errorMsg = 'Authentifizierung fehlgeschlagen.'; return; }
        const { token } = await res.json();

        const r = new Room();
        r.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Video && videoEl) {
            track.attach(videoEl);
            if (mounted) state = 'live';
          }
        });
        r.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach();
        });
        r.on(RoomEvent.Disconnected, () => {
          if (mounted) state = 'offline';
        });

        await r.connect(livekitUrl, token);
        if (mounted) {
          room = r;
          // If no tracks yet, show offline; tracks arriving will flip to live
          state = r.remoteParticipants.size === 0 ? 'offline' : 'live';
        }
      } catch (e) {
        if (mounted) { state = 'error'; errorMsg = String(e); }
      }
    }

    connect();
    return () => {
      mounted = false;
      room?.disconnect();
    };
  });
</script>

{#if state === 'loading'}
  <div class="flex items-center justify-center min-h-[360px] text-muted">Verbinde…</div>

{:else if state === 'error'}
  <StreamOffline message={errorMsg} />

{:else if state === 'offline'}
  <StreamOffline />

{:else if state === 'live' && room}
  <div class="grid grid-cols-[1fr_300px] h-[560px] bg-dark rounded-xl overflow-hidden border border-dark-lighter">
    <!-- Video + controls -->
    <div class="flex flex-col bg-black">
      <div class="relative flex-1">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={videoEl} autoplay playsinline class="w-full h-full object-contain"></video>
        <span class="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">● LIVE</span>
      </div>
      <div class="flex items-center gap-3 px-4 py-3 bg-dark-light border-t border-dark-lighter">
        <StreamReactions {room} />
        <StreamHandRaise {room} {isHost} />
      </div>
    </div>
    <!-- Chat -->
    <StreamChat {room} />
  </div>
{/if}
