<script lang="ts">
  interface Props {
    title?: string;
    subtitle?: string;
    tagline?: string;
  }

  let {
    title = 'Digital Coach &\nFührungskräfte-Mentor',
    subtitle = 'Mit 30+ Jahren Führungserfahrung bei der Polizei Hamburg begleite ich Menschen 50+ bei der digitalen Transformation und Führungskräfte bei ihrer beruflichen Weiterentwicklung.',
    tagline = 'Praxisnah. Strukturiert. Auf Augenhohe.',
  }: Props = $props();
</script>

<section class="relative bg-dark pt-28 pb-20 md:pt-36 md:pb-28">
  <div class="max-w-6xl mx-auto px-6">
    <div class="max-w-3xl">
      <p class="text-gold font-semibold text-lg mb-4 tracking-normal sm:tracking-widest uppercase">
        {tagline}
      </p>
      <h1 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-light leading-tight mb-6 whitespace-pre-line font-serif break-words">
        {title}
      </h1>
      <p class="text-lg sm:text-xl md:text-2xl text-muted leading-relaxed mb-10 max-w-2xl">
        {subtitle}
      </p>
      <div class="flex flex-col sm:flex-row gap-4">
        <a
          href="/kontakt"
          class="bg-gold hover:bg-gold-light text-dark px-8 py-4 rounded-full font-bold text-lg transition-all hover:shadow-lg hover:shadow-gold-dim text-center uppercase tracking-wide"
        >
          Kostenloses Erstgespräch
        </a>
        <a
          href="/#angebote"
          class="border-2 border-gold/40 text-gold hover:border-gold px-8 py-4 rounded-full font-bold text-lg transition-all text-center"
        >
          Angebote entdecken
        </a>
      </div>
    </div>
  </div>

  <!-- Decorative gold gradient -->
  <div class="absolute right-0 top-1/2 -translate-y-1/2 w-1/3 h-2/3 bg-gradient-to-l from-gold-dim to-transparent rounded-l-[4rem] hidden lg:block"></div>
</section>
