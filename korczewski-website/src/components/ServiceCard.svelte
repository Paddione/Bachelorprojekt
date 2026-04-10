<script lang="ts">
  interface Props {
    title: string;
    description: string;
    icon: string;
    features: string[];
    href: string;
    price?: string;
  }

  let { title, description, icon, features, href, price }: Props = $props();
</script>

<div class="bg-dark-light rounded-2xl border border-dark-lighter p-8 hover:border-gold/30 transition-all duration-300 hover:-translate-y-1 flex flex-col h-full">
  <div class="text-5xl mb-6">{icon}</div>
  <h3 class="text-2xl font-bold text-light mb-3 font-serif">{title}</h3>
  <p class="text-muted text-lg mb-6 leading-relaxed">{description}</p>

  <ul class="space-y-3 mb-8 flex-1">
    {#each features as feature}
      <li class="flex items-start gap-3 text-muted">
        <svg class="w-6 h-6 text-gold flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <span>{feature}</span>
      </li>
    {/each}
  </ul>

  {#if price}
    <p class="text-lg font-semibold text-gold mb-4">{price}</p>
  {/if}

  <a
    {href}
    class="block text-center bg-gold hover:bg-gold-light text-dark px-6 py-3.5 rounded-full font-bold text-lg transition-colors uppercase tracking-wide"
  >
    Mehr erfahren
  </a>
</div>
