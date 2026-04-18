<script lang="ts">
  import QuoteCard from './QuoteCard.svelte';

  interface WhyMePoint {
    title: string;
    text: string;
    iconPath?: string;
  }

  interface Props {
    headline: string;
    intro: string;
    points: WhyMePoint[];
    quote: string;
    quoteName: string;
    quoteRole?: string;
  }

  let { headline, intro, points, quote, quoteName, quoteRole = '' }: Props = $props();
</script>

<section class="why section" id="ueber" aria-labelledby="why-heading">
  <div class="wrap">
    <div class="why-grid">
      <!-- Left: text + points -->
      <div>
        <p class="eyebrow">{headline}</p>
        <h2 id="why-heading" set:html={intro.replace(/\*(.*?)\*/g, '<em>$1</em>')}></h2>

        <ol class="points" aria-label="Gründe">
          {#each points as point, i}
            <li class="point">
              <span class="point-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h4>{point.title}</h4>
                <p>{point.text}</p>
              </div>
            </li>
          {/each}
        </ol>
      </div>

      <!-- Right: quote card -->
      <div class="quote-col">
        <QuoteCard {quote} name={quoteName} role={quoteRole} />
      </div>
    </div>
  </div>
</section>

<style>
  .why {
    background: var(--ink-850);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }

  .section {
    padding: 120px 0;
  }

  .wrap {
    max-width: var(--maxw);
    margin: 0 auto;
    padding: 0 40px;
  }

  .why-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 80px;
    align-items: start;
  }

  .eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--brass);
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 16px;
  }

  .eyebrow::before {
    content: "";
    width: 22px;
    height: 1px;
    background: currentColor;
    opacity: 0.8;
    flex-shrink: 0;
  }

  h2 {
    font-family: var(--serif);
    font-size: clamp(32px, 3.6vw, 48px);
    font-weight: 400;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--fg);
    max-width: 18ch;
    margin: 0;
  }

  /* Allow italic accents in h2 text */
  h2 :global(em) {
    font-style: italic;
    color: var(--brass-2);
  }

  .points {
    list-style: none;
    padding: 0;
    margin: 40px 0 0;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
  }

  .point {
    padding: 26px 0;
    border-bottom: 1px solid var(--line);
    display: grid;
    grid-template-columns: 56px 1fr;
    gap: 22px;
    align-items: start;
  }

  .point-num {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--brass);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding-top: 6px;
  }

  .point h4 {
    font-family: var(--sans);
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--fg);
    margin: 0 0 6px;
  }

  .point p {
    font-size: 14px;
    line-height: 1.6;
    color: var(--mute);
    margin: 0;
  }

  .quote-col {
    padding-top: 56px;
  }

  @media (max-width: 960px) {
    .why-grid {
      grid-template-columns: 1fr;
      gap: 56px;
    }

    .section {
      padding: 80px 0;
    }

    .quote-col {
      padding-top: 0;
    }

    .wrap {
      padding: 0 22px;
    }
  }
</style>
