<script lang="ts">
  let { term, def }: { term: string; def: string } = $props();
  let open = $state(false);
</script>

<span class="ag-gloss-wrap">
  <button
    type="button"
    class="ag-gloss"
    aria-expanded={open}
    onclick={() => (open = !open)}
    onmouseenter={() => (open = true)}
    onmouseleave={() => (open = false)}
  >{term}</button>
  {#if open}
    <span class="ag-gloss-pop" role="note">{def}</span>
  {/if}
</span>
