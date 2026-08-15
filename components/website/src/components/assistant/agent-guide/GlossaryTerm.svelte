<script lang="ts">
  let { term, def }: { term: string; def: string } = $props();
  let pinned = $state(false);
  let hovered = $state(false);
  let open = $derived(pinned || hovered);
</script>

<span class="ag-gloss-wrap">
  <button
    type="button"
    class="ag-gloss"
    aria-expanded={open}
    onclick={() => (pinned = !pinned)}
    onmouseenter={() => (hovered = true)}
    onmouseleave={() => (hovered = false)}
  >{term}</button>
  {#if open}
    <span class="ag-gloss-pop" role="note">{def}</span>
  {/if}
</span>
