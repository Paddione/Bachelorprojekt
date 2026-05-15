<script lang="ts">
  import type { AssistantSource } from '../../lib/assistant/types';
  let { sources }: { sources: AssistantSource[] } = $props();
</script>

{#if sources.length > 0}
  <details style="margin-top: 4px; font-size: 10px; font-family: var(--font-sans);">
    <summary style="cursor: pointer; color: #d7b06a; opacity: .85; list-style: none; user-select: none;">
      📚 {sources.length} {sources.length === 1 ? 'Quelle' : 'Quellen'} verwendet
    </summary>
    <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 6px;">
      {#each sources as s}
        <div style="background: var(--ink-900); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px;">
          <div style="color: #d7b06a; font-weight: 600; margin-bottom: 2px;">
            [{s.index}] {s.bookTitle}{s.page !== null ? `, S. ${s.page}` : ''}
          </div>
          <div style="color: var(--mute); line-height: 1.4;">
            „{s.excerpt}{s.excerpt.length >= 300 ? '…' : ''}"
          </div>
        </div>
      {/each}
    </div>
  </details>
{/if}
