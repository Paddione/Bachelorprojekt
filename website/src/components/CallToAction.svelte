<script lang="ts">
  interface Props {
    title?: string;
    subtitle?: string;
    buttonText?: string;
    buttonHref?: string;
  }

  let {
    title = 'Bereit für den nächsten Schritt?',
    subtitle = 'Egal ob Sie digital selbstständiger werden möchten oder Ihre Karriere strategisch neu ausrichten wollen – der erste Schritt ist ein Gespräch.',
    buttonText = 'Kostenloses Erstgespräch vereinbaren',
    buttonHref = '/kontakt',
  }: Props = $props();
</script>

<section class="py-20 bg-dark-light border-t border-b border-dark-lighter">
  <div class="max-w-3xl mx-auto px-6 text-center">
    <h2 class="text-3xl md:text-4xl font-bold text-light mb-6 font-serif">{title}</h2>
    <p class="text-xl text-muted leading-relaxed mb-10">{subtitle}</p>

    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a
        href={buttonHref}
        class="bg-gold hover:bg-gold-light text-dark px-6 sm:px-8 py-4 rounded-full font-bold text-base sm:text-lg transition-all hover:shadow-lg hover:shadow-gold-dim uppercase tracking-wide text-center"
      >
        {buttonText}
      </a>
      <a
        href="/#angebote"
        class="border-2 border-gold/40 hover:border-gold text-gold px-8 py-4 rounded-full font-bold text-lg transition-all"
      >
        Angebote ansehen
      </a>
    </div>

    <p class="mt-8 text-muted-dark text-lg">Kein Verkaufsgespräch. Kein Druck. Nur Klarheit.</p>
  </div>
</section>
