<script lang="ts">
  import type { QaItem } from '../lib/qa-dal';

  export let item: QaItem;
  export let isActive: boolean = false;
  export let draftCount: number = 0;

  const CRITERIA_TOTAL = 5;

  function relTime(iso: string | null): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)} Min.`;
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }
</script>

<button
  class="qa-chip"
  class:active={isActive}
  data-testid="qa-chip-{item.extId}"
  on:click
  title="{item.title}{item.deployedAt ? ` · vor ${relTime(item.deployedAt)}` : ''}"
>
  <span class="ext-id">{item.extId}</span>
  <span class="badge">{draftCount}/{CRITERIA_TOTAL}</span>
</button>

<style>
  .qa-chip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    font-family: monospace;
    cursor: pointer;
    border: 1px solid transparent;
    background: #f0c040;
    color: #000;
    transition: opacity 0.15s;
  }
  .qa-chip.active {
    background: #6366f1;
    color: #fff;
    border-color: #818cf8;
  }
  .badge {
    font-size: 9px;
    background: rgba(0, 0, 0, 0.18);
    border-radius: 3px;
    padding: 1px 5px;
    font-family: monospace;
  }
</style>
