<script lang="ts">
  import BrettBroadcastModal from './BrettBroadcastModal.svelte';
  import PollBroadcastModal from './PollBroadcastModal.svelte';
  import TranscriptionModal from './TranscriptionModal.svelte';

  let openBrett = $state(false);
  let openPoll = $state(false);
  let openTr = $state(false);
</script>

<div data-testid="bulk-actions-bar" class="flex flex-wrap gap-2 mb-4">
  <button onclick={() => openBrett = true}
    class="px-4 py-2 bg-dark-light text-light rounded-lg text-sm font-semibold border border-dark-lighter hover:border-gold/40">
    🎯 Brett für alle
  </button>
  <button onclick={() => openPoll = true}
    class="px-4 py-2 bg-dark-light text-light rounded-lg text-sm font-semibold border border-dark-lighter hover:border-gold/40">
    📊 Umfrage starten
  </button>
  <button onclick={() => openTr = true}
    class="px-4 py-2 bg-dark-light text-light rounded-lg text-sm font-semibold border border-dark-lighter hover:border-gold/40">
    🎙 Transkription
  </button>
</div>

<BrettBroadcastModal open={openBrett} onclose={() => openBrett = false} />
<PollBroadcastModal open={openPoll} onclose={() => openPoll = false} />
<TranscriptionModal open={openTr} onclose={() => openTr = false} />
