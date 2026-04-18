<script lang="ts">
  interface FAQItem {
    question: string;
    answer: string;
  }

  interface Props {
    items: FAQItem[];
    title?: string;
  }

  let { items, title = 'Häufig gestellte Fragen' }: Props = $props();
  let openIndex = $state<number | null>(null);

  function toggle(index: number) {
    openIndex = openIndex === index ? null : index;
  }
</script>

<section class="faq-section" aria-labelledby="faq-heading">
  <div class="faq-wrap">
    <h2 id="faq-heading">{title}</h2>

    <div class="faq-list">
      {#each items as item, i}
        <div class="faq-item">
          <button
            class="faq-btn"
            onclick={() => toggle(i)}
            aria-expanded={openIndex === i}
            aria-controls="faq-answer-{i}"
          >
            <span class="faq-q">{item.question}</span>
            <svg
              class="faq-chevron {openIndex === i ? 'open' : ''}"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div
            id="faq-answer-{i}"
            role="region"
            aria-label={item.question}
            hidden={openIndex !== i}
            class="faq-answer"
          >
            {item.answer}
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .faq-section {
    padding: 80px 0;
    border-top: 1px solid var(--line);
  }

  .faq-wrap {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 40px;
  }

  h2 {
    font-family: var(--serif);
    font-size: clamp(28px, 3vw, 40px);
    font-weight: 400;
    letter-spacing: -0.02em;
    color: var(--fg);
    text-align: center;
    margin: 0 0 48px;
    line-height: 1.1;
  }

  .faq-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .faq-item {
    background: var(--ink-800);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }

  .faq-item:has(.faq-btn[aria-expanded="true"]) {
    border-color: var(--line-2);
  }

  .faq-btn {
    width: 100%;
    text-align: left;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .faq-btn:hover {
    background: rgba(255,255,255,.03);
  }

  .faq-q {
    font-size: 16px;
    font-weight: 500;
    color: var(--fg);
    line-height: 1.4;
  }

  .faq-chevron {
    width: 20px;
    height: 20px;
    color: var(--brass);
    flex-shrink: 0;
    transition: transform 0.3s ease;
  }

  .faq-chevron.open {
    transform: rotate(180deg);
  }

  .faq-answer {
    padding: 0 24px 20px;
    font-size: 15px;
    line-height: 1.6;
    color: var(--mute);
    border-top: 1px solid var(--line);
    padding-top: 16px;
    margin-top: -1px;
  }

  @media (max-width: 640px) {
    .faq-wrap {
      padding: 0 22px;
    }

    .faq-section {
      padding: 60px 0;
    }
  }
</style>
