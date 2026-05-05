<!-- website/src/components/LiveStream/StreamPlayer.svelte -->
<script lang="ts">
  import { Room, RoomEvent, Track } from 'livekit-client';
  import StreamOffline from './StreamOffline.svelte';
  import StreamChat from './StreamChat.svelte';
  import StreamReactions from './StreamReactions.svelte';
  import StreamHandRaise from './StreamHandRaise.svelte';

  let { livekitUrl, isHost = false, publishMode = 'view' }
    : { livekitUrl: string; isHost?: boolean; publishMode?: 'view' | 'browser' } = $props();

  type State = 'idle' | 'loading' | 'offline' | 'live' | 'error';
  let state = $state<State>('idle');
  let errorMsg = $state('');
  let room = $state<Room | null>(null);

  // Admin local preview elements
  let localScreenEl: HTMLVideoElement;
  let localCamEl: HTMLVideoElement;
  // Viewer remote track elements
  let remoteScreenEl: HTMLVideoElement;
  let remoteCamEl: HTMLVideoElement;

  let camOn = $state(false);
  let micOn = $state(false);
  let screenOn = $state(false);
  let publishBusy = $state(false);
  let publishError = $state('');
  let endingStream = $state(false);
  let remoteVideoPublishers = $state(0);
  let hasRemoteScreen = $state(false);
  let hasRemoteCam = $state(false);

  // Resolution selector — applies the next time a track is enabled
  type Resolution = '480' | '720' | '1080';
  let resolution = $state<Resolution>('720');
  const RESOLUTIONS: Record<Resolution, { width: number; height: number; frameRate: number }> = {
    '480':  { width: 854,  height: 480,  frameRate: 30 },
    '720':  { width: 1280, height: 720,  frameRate: 30 },
    '1080': { width: 1920, height: 1080, frameRate: 30 },
  };

  const showPublishUI = $derived(isHost && publishMode === 'browser');
  const otherStreamActive = $derived(remoteVideoPublishers > 0);
  const publishLocked = $derived(otherStreamActive && !camOn && !screenOn && !micOn);

  // Viewer PiP: cam is small only when screen share is also active
  const viewerCamIsPip = $derived(hasRemoteScreen && hasRemoteCam);
  // Admin PiP: cam is small only when screen share is also active
  const adminCamIsPip = $derived(screenOn && camOn);

  function recountRemoteVideo(r: Room) {
    let count = 0;
    r.remoteParticipants.forEach((p) => {
      const hasVideo = Array.from(p.videoTrackPublications.values()).some((pub) => !!pub.track);
      if (hasVideo) count++;
    });
    remoteVideoPublishers = count;
  }

  async function withBusy(fn: () => Promise<void>) {
    if (!room) return;
    publishBusy = true;
    publishError = '';
    try {
      await fn();
    } catch (e) {
      publishError = (e as Error).message ?? String(e);
    } finally {
      publishBusy = false;
    }
  }

  async function toggleCam() {
    if (publishLocked) return;
    await withBusy(async () => {
      const next = !camOn;
      await room!.localParticipant.setCameraEnabled(next, next ? { resolution: RESOLUTIONS[resolution] } : undefined);
      camOn = next;
      attachLocalTracks();
    });
  }

  async function toggleMic() {
    if (publishLocked) return;
    await withBusy(async () => {
      const next = !micOn;
      await room!.localParticipant.setMicrophoneEnabled(next);
      micOn = next;
    });
  }

  async function toggleScreen() {
    if (publishLocked) return;
    await withBusy(async () => {
      const next = !screenOn;
      await room!.localParticipant.setScreenShareEnabled(next, next ? { resolution: RESOLUTIONS[resolution] } : undefined);
      screenOn = next;
      attachLocalTracks();
    });
  }

  async function endActiveStream() {
    if (endingStream) return;
    endingStream = true;
    publishError = '';
    try {
      const res = await fetch('/api/stream/end', { method: 'POST' });
      if (!res.ok) {
        publishError = 'Stream beenden fehlgeschlagen.';
        return;
      }
      if (room) recountRemoteVideo(room);
    } catch (e) {
      publishError = (e as Error).message ?? String(e);
    } finally {
      endingStream = false;
    }
  }

  function attachLocalTracks() {
    if (!room) return;
    const screenPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const screenTrack = screenPub?.videoTrack;
    if (screenTrack && localScreenEl) {
      screenTrack.attach(localScreenEl);
    } else if (localScreenEl) {
      localScreenEl.srcObject = null;
    }
    const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const camTrack = camPub?.videoTrack;
    if (camTrack && localCamEl) {
      camTrack.attach(localCamEl);
    } else if (localCamEl) {
      localCamEl.srcObject = null;
    }
  }

  let mounted = $state(true);

  async function startConnection() {
    if (state !== 'idle' && state !== 'error') return;
    state = 'loading';
    errorMsg = '';
    try {
      const res = await fetch('/api/stream/token', { method: 'POST' });
      if (!res.ok) { state = 'error'; errorMsg = 'Authentifizierung fehlgeschlagen.'; return; }
      const { token } = await res.json();

      const r = new Room();
      r.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video) {
          if (track.source === Track.Source.ScreenShare && remoteScreenEl) {
            track.attach(remoteScreenEl);
            if (mounted) hasRemoteScreen = true;
          } else if (track.source === Track.Source.Camera && remoteCamEl) {
            track.attach(remoteCamEl);
            if (mounted) hasRemoteCam = true;
          }
          if (mounted) state = 'live';
        }
        if (mounted) recountRemoteVideo(r);
      });
      r.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        if (track.source === Track.Source.ScreenShare && mounted) hasRemoteScreen = false;
        if (track.source === Track.Source.Camera && mounted) hasRemoteCam = false;
        if (mounted) recountRemoteVideo(r);
      });
      r.on(RoomEvent.ParticipantDisconnected, () => {
        if (mounted) recountRemoteVideo(r);
      });
      r.on(RoomEvent.TrackPublished, () => {
        if (mounted) recountRemoteVideo(r);
      });
      r.on(RoomEvent.TrackUnpublished, () => {
        if (mounted) recountRemoteVideo(r);
      });
      r.on(RoomEvent.Disconnected, () => {
        if (mounted) state = 'offline';
      });

      await r.connect(livekitUrl, token);
      if (mounted) {
        room = r;
        recountRemoteVideo(r);
        if (isHost && publishMode === 'browser') {
          state = 'live';
        } else {
          state = r.remoteParticipants.size === 0 ? 'offline' : 'live';
        }
      }
    } catch (e) {
      if (mounted) { state = 'error'; errorMsg = String(e); }
    }
  }

  $effect(() => {
    return () => {
      mounted = false;
      room?.disconnect();
    };
  });
</script>

{#if state === 'idle'}
  <div class="flex flex-col items-center justify-center gap-4 min-h-[360px] bg-dark-light border border-dark-lighter rounded-xl">
    <button
      type="button"
      onclick={startConnection}
      class="px-6 py-3 rounded-lg bg-gold text-dark font-semibold text-base hover:bg-gold/90 transition-colors"
    >▶ {showPublishUI ? 'Live-Studio öffnen' : 'Stream verbinden'}</button>
    <p class="text-xs text-muted max-w-md text-center px-4">
      {showPublishUI
        ? 'Klicke, um deine Kamera/Mikro-Kontrollen zu laden. Browser-Audio wird erst nach Klick aktiviert.'
        : 'Klicke, um den Stream zu starten. Browser-Audio wird erst nach Klick aktiviert.'}
    </p>
  </div>

{:else if state === 'loading'}
  <div class="flex items-center justify-center min-h-[360px] text-muted">Verbinde…</div>

{:else if state === 'error'}
  <div class="flex flex-col items-center justify-center gap-4 min-h-[360px] bg-dark-light border border-dark-lighter rounded-xl">
    <StreamOffline message={errorMsg} />
    <button
      type="button"
      onclick={startConnection}
      class="px-4 py-2 rounded-lg border border-dark-lighter text-light text-sm font-semibold hover:border-gold transition-colors"
    >Erneut versuchen</button>
  </div>

{:else if state === 'offline'}
  <StreamOffline />

{:else if state === 'live' && room}
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] bg-dark rounded-xl overflow-hidden border border-dark-lighter">
    <!-- Video + controls -->
    <div class="flex flex-col bg-black min-h-0">
      <div class="relative overflow-hidden" style="aspect-ratio: 16/9; min-height: 240px;">

        {#if showPublishUI}
          <!-- Admin local preview — screen share fills background -->
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={localScreenEl}
            autoplay playsinline muted
            class="w-full h-full object-contain"
            class:hidden={!screenOn}
          ></video>
          <!-- Camera: PiP bottom-left when screen active, full otherwise -->
          <div class="{!camOn ? 'hidden' : ''} {adminCamIsPip
            ? 'absolute bottom-3 left-3 w-48 h-28 rounded-lg overflow-hidden border border-white/20 shadow-lg'
            : 'w-full h-full'}">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={localCamEl}
              autoplay playsinline muted
              class="w-full h-full {adminCamIsPip ? 'object-cover' : 'object-contain'}"
            ></video>
          </div>
          {#if !screenOn && !camOn}
            <div class="w-full h-full flex items-center justify-center text-muted text-sm">
              Kamera oder Bildschirm aktivieren
            </div>
          {/if}

        {:else}
          <!-- Viewer: remote screen share fills background -->
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={remoteScreenEl}
            autoplay playsinline
            class="w-full h-full object-contain"
            class:hidden={!hasRemoteScreen}
          ></video>
          <!-- Remote camera: PiP when screen active, full otherwise -->
          <div class="{!hasRemoteCam ? 'hidden' : ''} {viewerCamIsPip
            ? 'absolute bottom-3 left-3 w-48 h-28 rounded-lg overflow-hidden border border-white/20 shadow-lg'
            : 'w-full h-full'}">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={remoteCamEl}
              autoplay playsinline
              class="w-full h-full {viewerCamIsPip ? 'object-cover' : 'object-contain'}"
            ></video>
          </div>
        {/if}

        {#if camOn || micOn || screenOn || (!showPublishUI && (hasRemoteScreen || hasRemoteCam))}
          <span class="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">● LIVE</span>
        {/if}
      </div>

      {#if showPublishUI && otherStreamActive}
        <div class="flex items-start gap-3 px-4 py-3 bg-amber-950/40 border-t border-amber-800/60 text-sm">
          <span class="text-amber-300">⚠️</span>
          <div class="flex-1">
            <p class="text-amber-100 font-semibold">Es läuft bereits ein Livestream.</p>
            <p class="text-amber-200/80 text-xs mt-0.5">
              Beende den aktuellen Stream (z.&nbsp;B. OBS oder einen anderen Browser-Sender), bevor du einen neuen startest.
            </p>
          </div>
          <button
            onclick={endActiveStream}
            disabled={endingStream}
            class="px-3 py-1.5 rounded-lg border border-amber-500 text-amber-100 text-xs font-semibold hover:bg-amber-500 hover:text-dark transition-colors disabled:opacity-50"
          >{endingStream ? 'Beende…' : 'Aktuellen Stream beenden'}</button>
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-dark-light border-t border-dark-lighter">
        {#if showPublishUI}
          <button
            onclick={toggleCam}
            disabled={publishBusy || publishLocked}
            title={publishLocked ? 'Beende zuerst den laufenden Stream.' : ''}
            class="px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                   {camOn ? 'bg-gold text-dark border-gold' : 'bg-dark border-dark-lighter text-light hover:border-gold'}"
          >📹 {camOn ? 'Kamera aus' : 'Kamera an'}</button>
          <button
            onclick={toggleMic}
            disabled={publishBusy || publishLocked}
            title={publishLocked ? 'Beende zuerst den laufenden Stream.' : ''}
            class="px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                   {micOn ? 'bg-gold text-dark border-gold' : 'bg-dark border-dark-lighter text-light hover:border-gold'}"
          >🎤 {micOn ? 'Mikro aus' : 'Mikro an'}</button>
          <button
            onclick={toggleScreen}
            disabled={publishBusy || publishLocked}
            title={publishLocked ? 'Beende zuerst den laufenden Stream.' : ''}
            class="px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                   {screenOn ? 'bg-gold text-dark border-gold' : 'bg-dark border-dark-lighter text-light hover:border-gold'}"
          >🖥️ {screenOn ? 'Bildschirm aus' : 'Bildschirm teilen'}</button>

          <!-- Resolution selector -->
          <label class="flex items-center gap-1.5 text-sm text-muted">
            <span>Qualität</span>
            <select
              bind:value={resolution}
              class="bg-dark border border-dark-lighter text-light text-xs rounded px-2 py-1 cursor-pointer hover:border-gold transition-colors"
              title="Max. Auflösung (gilt beim nächsten Aktivieren)"
            >
              <option value="480">480p</option>
              <option value="720">720p</option>
              <option value="1080">1080p</option>
            </select>
          </label>

          {#if publishError}
            <span class="text-xs text-red-400">{publishError}</span>
          {/if}
          <span class="ml-auto"></span>
        {/if}
        <StreamReactions {room} />
        <StreamHandRaise {room} {isHost} />
      </div>
    </div>
    <!-- Chat -->
    <StreamChat {room} />
  </div>
{/if}
