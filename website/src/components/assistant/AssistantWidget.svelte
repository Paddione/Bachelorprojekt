<script lang="ts">
  import type { AssistantProfile, Nudge } from '../../lib/assistant/types';
  import AssistantBubble from './AssistantBubble.svelte';
  import AssistantChat from './AssistantChat.svelte';

  let { profile }: { profile: AssistantProfile } = $props();

  let chatOpen = $state(false);
  let nudges = $state<Nudge[]>([]);
  let activeNudge = $derived(nudges[0] ?? null);

  let pollHandle: number | undefined;

  async function fetchNudges() {
    if (typeof document === 'undefined' || document.hidden) return;
    try {
      const r = await fetch(`/api/assistant/nudges?profile=${profile}&route=${encodeURIComponent(location.pathname)}`);
      const j = await r.json();
      if (Array.isArray(j?.nudges)) nudges = j.nudges;
    } catch (err) {
      console.warn('[assistant] nudge fetch failed', err);
    }
  }

  $effect(() => {
    fetchNudges();
    pollHandle = window.setInterval(fetchNudges, 45_000);
    return () => clearInterval(pollHandle);
  });

  async function dismiss(nudge: Nudge, snoozeSeconds = 86400) {
    nudges = nudges.filter((n) => n.id !== nudge.id);
    await fetch('/api/assistant/dismiss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nudgeId: nudge.id, snoozeSeconds }),
    });
  }

  function openChatFromNudge(nudge: Nudge, kickoff?: string) {
    chatOpen = true;
    dismiss(nudge);
    if (kickoff) {
      sessionStorage.setItem('assistant.kickoff', kickoff);
    }
  }
</script>

<!-- Floating icon (always shown) -->
<button
  onclick={() => (chatOpen = !chatOpen)}
  aria-label={chatOpen ? 'Chat schließen' : 'Mentolder-Assistent öffnen'}
  style="
    position: fixed; bottom: 24px; right: 24px; z-index: 50;
    width: 44px; height: 44px; border-radius: 50%;
    background: #d7b06a; color: #0b111c; border: none; cursor: pointer;
    font-size: 18px; font-weight: 600; font-family: var(--font-sans);
    box-shadow: 0 6px 18px rgba(215,176,106,.5);
  "
>{chatOpen ? '✕' : '?'}</button>

{#if chatOpen}
  <AssistantChat {profile} onClose={() => (chatOpen = false)} />
{:else if activeNudge}
  <AssistantBubble
    nudge={activeNudge}
    onPrimary={() => openChatFromNudge(activeNudge, activeNudge.primaryAction?.kickoff)}
    onSecondary={() => activeNudge.secondaryAction && openChatFromNudge(activeNudge, activeNudge.secondaryAction.kickoff)}
    onClose={() => dismiss(activeNudge)}
  />
{/if}
