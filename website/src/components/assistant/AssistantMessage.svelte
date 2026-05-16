<script lang="ts">
  import type { Message, AssistantSource } from '../../lib/assistant/types';
  import SourcesBox from './SourcesBox.svelte';

  let { message, sources = [] }: { message: Message; sources?: AssistantSource[] } = $props();
  const isUser = $derived(message.role === 'user');

  function renderCitations(text: string): string {
    return text.replace(/\[(\d+)\]/g, (_, n) =>
      `<sup style="font-size:9px;color:#d7b06a;font-weight:600;cursor:default;" title="Quelle ${n}">[${n}]</sup>`
    );
  }
</script>

<div
  class="msg"
  class:in={!isUser}
  class:out={isUser}
  style="font-size: 12px; line-height: 1.45; padding: 7px 10px; border-radius: 8px; max-width: 80%;
         font-family: var(--font-sans); color: var(--fg);"
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html renderCitations(message.content)}
  {#if !isUser}
    <SourcesBox {sources} />
  {/if}
</div>

<style>
  .msg.in  { background: var(--ink-900); border: 1px solid var(--line); align-self: flex-start; border-radius: 8px 8px 8px 2px; }
  .msg.out { background: rgba(215,176,106,.16); border: 1px solid #d7b06a; align-self: flex-end; border-radius: 8px 8px 2px 8px; }
</style>
