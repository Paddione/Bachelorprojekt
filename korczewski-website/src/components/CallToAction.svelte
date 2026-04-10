<script lang="ts">
  interface Props {
    title?: string;
    subtitle?: string;
    buttonText?: string;
    buttonHref?: string;
  }

  let {
    title = 'Bereit, den nachsten Schritt zu machen?',
    subtitle = 'Ob Sie KI in Ihren Workflow integrieren, eine Open-Source-Losung deployen oder einfach wissen wollen, wo Sie anfangen sollen \u2013 lassen Sie uns reden.',
    buttonText = 'Kennenlerngesprach vereinbaren',
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
        class="bg-gold hover:bg-gold-light text-dark px-8 py-4 rounded-full font-bold text-lg transition-all hover:shadow-lg hover:shadow-gold-dim uppercase tracking-wide"
      >
        {buttonText}
      </a>
      <a
        href="/leistungen"
        class="border-2 border-gold/40 hover:border-gold text-gold px-8 py-4 rounded-full font-bold text-lg transition-all"
      >
        Alle Leistungen
      </a>
    </div>

    <p class="mt-8 text-muted-dark text-lg">45 Minuten. 20 Euro. Keine versteckten Kosten.</p>
  </div>
</section>
