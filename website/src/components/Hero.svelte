<script lang="ts">
  import Portrait from './Portrait.svelte';

  interface Props {
    title?: string;
    subtitle?: string;
    tagline?: string;
    titleEmphasis?: string;
    avatarType?: 'image' | 'initials';
    avatarSrc?: string;
    avatarInitials?: string;
    personName?: string;
    personRole?: string;
  }

  let {
    title = 'Menschen, Prozesse und Technik',
    titleEmphasis = 'der Mensch und Technologie wieder verbindet.',
    subtitle = 'Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe.',
    tagline = 'Digital Coach & Führungskräfte-Mentor',
    avatarType = 'initials',
    avatarSrc,
    avatarInitials = '',
    personName = '',
    personRole = '',
  }: Props = $props();

  // Split tagline on common separators to show as two kicker segments
  const kickerParts = tagline.split(/[·&]/).map(s => s.trim()).filter(Boolean);
</script>

<section class="hero" aria-label="Hero-Bereich">
  <!-- Background halo atmosphere -->
  <div class="bg-halo" aria-hidden="true"></div>

  <div class="wrap">
    <div class="grid">
      <!-- Left column: copy -->
      <div class="hero-copy">
        <!-- Kicker row -->
        <div class="kicker-row" aria-label="Kategorien">
          <span class="bar" aria-hidden="true"></span>
          {#each kickerParts as part, i}
            {#if i > 0}
              <span class="sep-dot" aria-hidden="true"></span>
            {/if}
            <span>{part}</span>
          {/each}
        </div>

        <!-- H1 -->
        <h1>
          {title}{#if titleEmphasis}
            {' '}<em>{titleEmphasis}</em>
          {/if}
        </h1>

        <!-- Lede -->
        <p class="lede">{subtitle}</p>

        <!-- CTA row -->
        <div class="hero-cta" role="group" aria-label="Aktionen">
          <a href="/kontakt" class="btn btn-primary">
            Kostenloses Erstgespräch
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 7h10M8 3l4 4-4 4"/>
            </svg>
          </a>
          <a href="/#angebote" class="btn btn-ghost">Angebote ansehen</a>
        </div>
      </div>

      <!-- Right column: portrait -->
      {#if avatarType || avatarSrc}
        <div class="hero-portrait">
          <Portrait
            {avatarType}
            {avatarSrc}
            {avatarInitials}
            name={personName}
            role={personRole}
          />
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .hero {
    position: relative;
    padding: 76px 0 120px;
    border-bottom: 1px solid var(--line);
  }

  .bg-halo {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 0;
  }

  .bg-halo::before {
    content: "";
    position: absolute;
    right: -20%;
    top: -30%;
    width: 90vw;
    height: 90vw;
    background: radial-gradient(closest-side, oklch(0.80 0.09 75 / .11), transparent 70%);
    filter: blur(10px);
  }

  .bg-halo::after {
    content: "";
    position: absolute;
    left: -30%;
    bottom: -40%;
    width: 80vw;
    height: 80vw;
    background: radial-gradient(closest-side, oklch(0.60 0.05 250 / .25), transparent 70%);
  }

  .wrap {
    max-width: var(--maxw);
    margin: 0 auto;
    padding: 0 40px;
    position: relative;
    z-index: 2;
  }

  .grid {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 64px;
    align-items: end;
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
  }

  .kicker-row {
    display: flex;
    align-items: center;
    gap: 14px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mute);
    margin-bottom: 26px;
  }

  .bar {
    flex: 0 0 44px;
    height: 1px;
    background: var(--brass);
    opacity: 0.7;
  }

  .sep-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--sage);
    flex-shrink: 0;
  }

  h1 {
    font-family: var(--serif);
    font-size: clamp(44px, 6.2vw, 88px);
    font-weight: 300;
    line-height: 1.02;
    letter-spacing: -0.02em;
    color: var(--fg);
    margin: 0;
  }

  h1 em {
    font-style: italic;
    font-weight: 400;
    color: var(--brass-2);
  }

  .lede {
    font-size: 18px;
    line-height: 1.6;
    color: var(--fg-soft);
    max-width: 52ch;
    margin-top: 20px;
  }

  .hero-cta {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
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

  .hero-portrait {
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
  }

  @media (max-width: 960px) {
    .hero {
      padding: 56px 0 80px;
    }

    .grid {
      grid-template-columns: 1fr;
      gap: 56px;
    }

    .hero-portrait {
      justify-content: center;
    }

    .wrap {
      padding: 0 22px;
    }
  }
</style>
