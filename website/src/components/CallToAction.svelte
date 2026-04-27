<script lang="ts">
  interface Props {
    eyebrow?: string;
    title?: string;
    titleEmphasis?: string;
    subtitle?: string;
    primaryText?: string;
    primaryHref?: string;
    secondaryText?: string;
    secondaryHref?: string;
  }

  let {
    eyebrow = 'Kostenloses Erstgespräch',
    title = 'In 30 Minuten wissen wir,',
    titleEmphasis = 'ob es passt.',
    subtitle = 'Kein Verkaufsgespräch. Kein Druck. Nur Klarheit. Wo stehen Sie – und wie könnte eine Zusammenarbeit konkret aussehen?',
    primaryText = 'Termin vorschlagen',
    primaryHref = '/kontakt',
    secondaryText = '',
    secondaryHref = '',
  }: Props = $props();
</script>

<section class="cta" id="termin" aria-labelledby="cta-heading">
  <div class="glow" aria-hidden="true"></div>
  <div class="wrap">
    <p class="eyebrow">{eyebrow}</p>
    <h2 id="cta-heading">
      {title}
      {#if titleEmphasis}
        {' '}<em>{titleEmphasis}</em>
      {/if}
    </h2>
    <p class="subtitle">{subtitle}</p>
    <div class="btn-row" role="group" aria-label="Kontaktoptionen">
      <a href={primaryHref} class="btn btn-primary">
        {primaryText}
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 7h10M8 3l4 4-4 4"/>
        </svg>
      </a>
      <a href={secondaryHref} class="btn btn-ghost">{secondaryText}</a>
    </div>
  </div>
</section>

<style>
  .cta {
    padding: 130px 0;
    border-top: 1px solid var(--line);
    position: relative;
    overflow: hidden;
  }

  .glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 50% 100%, oklch(0.80 0.09 75 / .16), transparent 60%);
    pointer-events: none;
  }

  .wrap {
    max-width: 760px;
    margin: 0 auto;
    padding: 0 40px;
    text-align: center;
    position: relative;
    z-index: 1;
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
    margin: 0 0 24px;
  }

  .eyebrow::before {
    content: "";
    width: 22px;
    height: 1px;
    background: currentColor;
    opacity: 0.8;
  }

  h2 {
    font-family: var(--serif);
    font-size: clamp(36px, 4.6vw, 60px);
    font-weight: 350;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
  }

  h2 em {
    font-style: italic;
    font-weight: 400;
    color: var(--brass-2);
  }

  .subtitle {
    font-size: 18px;
    line-height: 1.6;
    color: var(--fg-soft);
    max-width: 54ch;
    margin: 20px auto 0;
  }

  .btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    justify-content: center;
    margin-top: 36px;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 14px 22px;
    border-radius: 999px;
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  }

  .btn svg {
    width: 14px;
    height: 14px;
  }

  .btn-primary {
    background: var(--brass);
    color: var(--ink-900);
  }

  .btn-primary:hover {
    background: var(--brass-2);
    transform: translateY(-1px);
  }

  .btn-ghost {
    color: var(--fg);
    border: 1px solid var(--line-2);
    background: transparent;
  }

  .btn-ghost:hover {
    border-color: var(--brass);
    color: var(--brass);
  }

  @media (max-width: 640px) {
    .cta {
      padding: 80px 0;
    }

    .wrap {
      padding: 0 22px;
    }
  }
</style>
