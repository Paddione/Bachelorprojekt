<script lang="ts">
  import AdminEmptyState from './AdminEmptyState.svelte';

  interface Column {
    key: string;
    label: string;
    sortable?: boolean;
    width?: string;
  }

  interface Props {
    columns: Column[];
    rows: Record<string, any>[];
    loading?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    cell?: (args: { key: string; row: Record<string, any>; index: number }) => any;
  }

  let {
    columns = [],
    rows = [],
    loading = false,
    emptyTitle = 'Keine Daten',
    emptyDescription = '',
    cell,
  }: Props = $props();

  let sortKey = $state('');
  let sortDir = $state<'asc' | 'desc'>('asc');

  function toggleSort(key: string) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
  }

  const sortedRows = $derived.by(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  });

  const SKELETON_ROWS = 5;
</script>

{#if loading}
  <div class="table-wrap" role="status" aria-label="Lade Daten">
    <table class="table">
      <thead>
        <tr>
          {#each columns as col}
            <th class="table__th">{col.label}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each Array(SKELETON_ROWS) as _}
          <tr class="table__skeleton-row">
            {#each columns as col}
              <td class="table__td"><span class="table__skeleton"></span></td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else if rows.length === 0}
  <AdminEmptyState
    icon="inbox"
    title={emptyTitle}
    description={emptyDescription}
  />
{:else}
  <div class="table-wrap" role="table" aria-label="Datentabelle">
    <table class="table">
      <thead>
        <tr>
          {#each columns as col}
            <th
              class="table__th"
              style={col.width ? `width: ${col.width}` : ''}
              aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
            >
              {#if col.sortable !== false}
                <button class="table__sort-btn" onclick={() => toggleSort(col.key)}>
                  {col.label}
                  {#if sortKey === col.key}
                    <span class="table__sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  {/if}
                </button>
              {:else}
                {col.label}
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each sortedRows as row, i}
          <tr class="table__row">
            {#each columns as col}
              <td class="table__td">
                {#if cell}
                  {@render cell({ key: col.key, row, index: i })}
                {:else}
                  {row[col.key] ?? ''}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--admin-border);
    border-radius: var(--admin-card-radius);
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--admin-text-sm);
  }

  .table__th {
    padding: var(--space-3) var(--space-4);
    text-align: left;
    font-weight: 600;
    color: var(--admin-text-mute);
    font-size: var(--admin-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--admin-border);
    background: var(--admin-surface);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .table__sort-btn {
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    text-align: left;
  }

  .table__sort-btn:hover {
    color: var(--admin-text);
  }

  .table__sort-icon {
    font-size: 10px;
  }

  .table__td {
    padding: var(--space-3) var(--space-4);
    color: var(--admin-text);
    border-bottom: 1px solid var(--admin-border);
    vertical-align: middle;
    height: var(--admin-table-row-height);
  }

  .table__row {
    transition: background var(--admin-transition-fast);
  }

  .table__row:hover {
    background: var(--admin-surface-hover);
  }

  .table__row:last-child .table__td {
    border-bottom: none;
  }

  .table__skeleton-row .table__td {
    padding: var(--space-3) var(--space-4);
  }

  .table__skeleton {
    display: block;
    height: var(--admin-text-sm);
    background: var(--admin-surface);
    border-radius: 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
  }
</style>
