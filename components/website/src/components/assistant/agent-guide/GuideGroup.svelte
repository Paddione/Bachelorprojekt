<script lang="ts">
  import GuideCard from './GuideCard.svelte';
  import type { Group } from '../../../lib/agentGuideSearch';

  let {
    group,
    groupOpen = true,
    expanded,
    query = '',
    copiedId = null,
    learnedItems = new Map(),
    onToggleGroup,
    onToggleCard,
    onJump,
    onCopy,
  }: {
    group: Group;
    groupOpen?: boolean;
    expanded: Set<string>;
    query?: string;
    copiedId?: string | null;
    learnedItems?: Map<string, { status: 'todo' | 'in_progress' | 'done'; note: string }>;
    onToggleGroup: (key: string) => void;
    onToggleCard: (id: string) => void;
    onJump: (id: string) => void;
    onCopy: (id: string, text: string) => void;
  } = $props();
</script>

<section class="ag-group" style={group.color ? `--accent: ${group.color}` : ''}>
  <button
    type="button"
    class="ag-group-head"
    aria-expanded={groupOpen}
    onclick={() => onToggleGroup(group.key)}
  >
    {#if group.emoji}<span class="ag-group-emoji" aria-hidden="true">{group.emoji}</span>{/if}
    <span class="ag-group-label">{group.label_de}</span>
    <span class="ag-group-count">{group.entries.length}</span>
    <span class="ag-chevron" aria-hidden="true">{groupOpen ? '▾' : '▸'}</span>
  </button>

  {#if groupOpen}
    <div class="ag-group-cards">
      {#each group.entries as entry (entry.id)}
        <GuideCard
          {entry}
          open={expanded.has(entry.id)}
          {query}
          {copiedId}
          status={learnedItems.get(entry.id)?.status ?? 'todo'}
          note={learnedItems.get(entry.id)?.note ?? ''}
          onToggle={onToggleCard}
          {onJump}
          {onCopy}
        />
      {/each}
    </div>
  {/if}
</section>
