<!-- website/src/components/LiveStream/StreamPlayer.svelte -->
<script lang="ts">
  import StreamOffline from './StreamOffline.svelte';

  let { livekitUrl = '', isHost = false, publishMode = 'view' }
    : { livekitUrl?: string; isHost?: boolean; publishMode?: 'view' | 'browser' } = $props();
</script>

<StreamOffline message="Livestreaming ist derzeit nicht aktiv" />
