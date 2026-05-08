<script lang="ts">
  import StreamPlayer from '../../LiveStream/StreamPlayer.svelte';
  import PublishControls from './PublishControls.svelte';
  import RecordingPanel from './RecordingPanel.svelte';
  import PollOverlayPanel from './PollOverlayPanel.svelte';
  import type { ActivePoll } from '../../../lib/live-state';

  let {
    livekitUrl,
    streamDomain,
    rtmpKey,
    pollActive = null,
  }: {
    livekitUrl: string;
    streamDomain: string;
    rtmpKey: string;
    pollActive?: ActivePoll | null;
  } = $props();

  let mode = $state<'browser' | 'obs'>('browser');
</script>

<div data-testid="stream-cockpit" class="space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-xs uppercase tracking-wide text-muted">Stream-Cockpit</h2>
  </div>

  {#if pollActive}
    <PollOverlayPanel {pollActive} />
  {/if}

  <PublishControls bind:mode {streamDomain} {rtmpKey} />
  <RecordingPanel />

  <StreamPlayer
    livekitUrl={livekitUrl}
    isHost={true}
    publishMode={mode}
  />
</div>
