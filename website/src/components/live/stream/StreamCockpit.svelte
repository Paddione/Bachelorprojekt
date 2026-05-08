<script lang="ts">
  import StreamPlayer from '../../LiveStream/StreamPlayer.svelte';
  import PublishControls from './PublishControls.svelte';
  import RecordingPanel from './RecordingPanel.svelte';

  let {
    livekitUrl,
    streamDomain,
    rtmpKey,
  }: { livekitUrl: string; streamDomain: string; rtmpKey: string } = $props();

  let mode = $state<'browser' | 'obs'>('browser');
</script>

<div data-testid="stream-cockpit" class="space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-xs uppercase tracking-wide text-muted">Stream-Cockpit</h2>
  </div>

  <PublishControls bind:mode {streamDomain} {rtmpKey} />
  <RecordingPanel />

  <StreamPlayer
    livekitUrl={livekitUrl}
    isHost={true}
    publishMode={mode}
  />
</div>
