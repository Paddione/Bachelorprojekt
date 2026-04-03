<script lang="ts">
  interface FAQItem {
    question: string;
    answer: string;
  }

  interface Props {
    items: FAQItem[];
    title?: string;
  }

  let { items, title = 'Haufig gestellte Fragen' }: Props = $props();
  let openIndex = $state<number | null>(null);

  function toggle(index: number) {
    openIndex = openIndex === index ? null : index;
  }
</script>

<section class="py-20 bg-dark-light">
  <div class="max-w-3xl mx-auto px-6">
    <h2 class="text-3xl md:text-4xl font-bold text-light text-center mb-12 font-serif">{title}</h2>

    <div class="space-y-4">
      {#each items as item, i}
        <div class="bg-dark rounded-xl border border-dark-lighter overflow-hidden">
          <button
            class="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-dark-lighter/50 transition-colors"
            onclick={() => toggle(i)}
            aria-expanded={openIndex === i}
          >
            <span class="text-lg font-semibold text-light">{item.question}</span>
            <svg
              class="w-6 h-6 text-gold flex-shrink-0 transition-transform duration-300 {openIndex === i ? 'rotate-180' : ''}"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if openIndex === i}
            <div class="px-6 pb-5 text-muted text-lg leading-relaxed border-t border-dark-lighter pt-4">
              {item.answer}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</section>
