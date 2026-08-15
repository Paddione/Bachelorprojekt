<script lang="ts">
  interface Props {
    icon: string;
    label: string;
    dot: 'green' | 'red' | null;
    meta: string;
    chain?: string;
    isLink?: boolean;
    href?: string;
    onclick?: () => void;
  }
  let { icon, label, dot, meta, chain, isLink, href, onclick }: Props = $props();
</script>

{#if isLink && href}
  <a class="card card-link" {href}>
    <div class="card-head">
      <span class="icon">{icon}</span>
      <span class="title">{label}</span>
    </div>
    <p class="meta">{meta}</p>
    {#if chain}<p class="chain">{chain}</p>{/if}
  </a>
{:else}
  <button class="card" {onclick}>
    <div class="card-head">
      <span class="icon">{icon}</span>
      <span class="title">{label}</span>
      {#if dot}
        <span class="dot {dot}"></span>
      {/if}
    </div>
    <p class="meta">{meta}</p>
    {#if chain}<p class="chain">{chain}</p>{/if}
  </button>
{/if}
