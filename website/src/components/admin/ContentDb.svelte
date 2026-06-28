<!-- website/src/components/admin/ContentDb.svelte -->
<script lang="ts">
  import type { ContentEntry } from '../../lib/content-db-merge';

  let { entries: initial }: { entries: ContentEntry[] } = $props();

  type FilterType = 'all' | 'questionnaire' | 'vorlage' | 'vertrag';
  let activeFilter: FilterType = $state('all');

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'questionnaire', label: 'Fragebögen' },
    { key: 'vorlage', label: 'Vorlagen' },
    { key: 'vertrag', label: 'Verträge' },
  ];

  let filtered = $derived(
    activeFilter === 'all'
      ? initial
      : initial.filter(e => e.type === activeFilter),
  );

  const typeLabels: Record<string, string> = {
    questionnaire: 'Fragebogen',
    vorlage: 'Vorlage',
    vertrag: 'Vertrag',
  };

  const typeColors: Record<string, string> = {
    questionnaire: 'var(--admin-sage, #4ade80)',
    vorlage: 'var(--admin-primary, #c9a55c)',
    vertrag: 'var(--admin-info, #38bdf8)',
  };
</script>

<div class="content-db">
  <div class="filters">
    {#each filters as f}
      <button
        class="filter-pill"
        class:active={activeFilter === f.key}
        onclick={() => (activeFilter = f.key)}
      >
        {f.label}
      </button>
    {/each}
  </div>

  {#if filtered.length === 0}
    <p class="empty">Keine Einträge gefunden.</p>
  {:else}
    <table class="content-table">
      <thead>
        <tr>
          <th>Typ</th>
          <th>Titel</th>
          <th>Status</th>
          <th>Meta</th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as entry}
          <tr>
            <td>
              <span
                class="type-badge"
                style="border-color: {typeColors[entry.type]}; color: {typeColors[entry.type]};"
              >
                {typeLabels[entry.type]}
              </span>
            </td>
            <td>
              <a href={entry.detailHref} class="entry-link">{entry.title}</a>
            </td>
            <td class="meta-cell">{entry.status ?? '—'}</td>
            <td class="meta-cell">{entry.meta ?? '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .content-db {
    margin-top: 1rem;
  }
  .filters {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .filter-pill {
    padding: 0.3rem 0.75rem;
    border: 1px solid var(--admin-border, #333);
    border-radius: 999px;
    background: transparent;
    color: var(--admin-text-mute, #888);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .filter-pill.active {
    border-color: var(--admin-primary, #c9a55c);
    color: var(--admin-primary, #c9a55c);
  }
  .filter-pill:hover {
    border-color: var(--admin-text-mute, #888);
  }
  .empty {
    color: var(--admin-text-mute, #888);
    padding: 2rem 0;
  }
  .content-table {
    width: 100%;
    border-collapse: collapse;
  }
  .content-table th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--admin-border, #333);
    font-size: 0.8rem;
    color: var(--admin-text-mute, #888);
  }
  .content-table td {
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--admin-border, #333);
    font-size: 0.85rem;
  }
  .type-badge {
    font-size: 0.7rem;
    padding: 0.1rem 0.5rem;
    border: 1px solid;
    border-radius: 999px;
    white-space: nowrap;
  }
  .entry-link {
    color: var(--admin-text, #eee);
    text-decoration: none;
    transition: color 0.15s;
  }
  .entry-link:hover {
    color: var(--admin-primary, #c9a55c);
  }
  .meta-cell {
    color: var(--admin-text-mute, #888);
    font-size: 0.8rem;
  }
</style>