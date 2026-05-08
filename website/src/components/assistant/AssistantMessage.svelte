<script lang="ts">
  import type { Message } from '../../lib/assistant/types';
  let { message }: { message: Message } = $props();
  const isUser = $derived(message.role === 'user');
</script>

<div
  class="msg"
  class:in={!isUser}
  class:out={isUser}
  style="font-size: 12px; line-height: 1.45; padding: 7px 10px; border-radius: 8px; max-width: 80%;
         font-family: var(--font-sans); color: var(--fg);"
>
  {message.content}
</div>

<style>
  .msg.in  { background: var(--ink-900); border: 1px solid var(--line); align-self: flex-start; border-radius: 8px 8px 8px 2px; }
  .msg.out { background: rgba(215,176,106,.16); border: 1px solid #d7b06a; align-self: flex-end; border-radius: 8px 8px 2px 8px; }
</style>
