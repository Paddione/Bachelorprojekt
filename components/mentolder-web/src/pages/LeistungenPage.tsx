import { Link } from 'react-router-dom';
import { KickerBar } from '@/components/KickerBar';
import { CallToAction } from '@/components/CallToAction';
import { ServiceCard } from '@/components/ServiceCard';
import { leistungenKategorien } from '@/content';
import { iconRegistry } from '@/components/icons';

export function LeistungenPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-[80px] pb-[60px] max-md:pt-[56px]">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <KickerBar parts={['Leistungen & Preise']} className="mb-6" />
          <h1
            className="font-serif font-light text-fg leading-[1.05] m-0"
            style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', letterSpacing: '-0.02em' }}
          >
            Leistungen & Preise
          </h1>
          <p className="text-[18px] leading-[1.6] text-fg-soft mt-5 max-w-[52ch]">
            Alle Angebote auf einen Blick. Wählen Sie das passende Format und nehmen Sie Kontakt auf.
          </p>
        </div>
      </section>

      {/* Erstgespräch-Hero-Card */}
      <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px] mb-16">
        <div
          className="rounded-xl border bg-ink-850 p-8 text-center"
          style={{ borderColor: 'oklch(0.80 0.09 75 / .3)' }}
        >
          <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-brass m-0 mb-3">
            Einstieg
          </p>
          <h2
            className="font-serif font-normal text-fg m-0 mb-2"
            style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', letterSpacing: '-0.015em' }}
          >
            Kostenloses Erstgespräch
          </h2>
          <p className="text-fg-soft text-[15px] m-0 mb-2">
            30 Minuten · kostenlos & unverbindlich
          </p>
          <p className="text-fg-soft text-[14px] m-0 mb-6 max-w-[40ch] mx-auto">
            Wir klären gemeinsam, ob und wie ich Sie unterstützen kann.
            Kein Verkaufsgespräch — ein ehrliches Kennenlernen.
          </p>
          <Link
            to="/kontakt"
            className="inline-flex items-center gap-2 font-medium text-ink-900 no-underline px-6 py-3 rounded-full"
            style={{ background: 'var(--brass)', fontSize: '14px' }}
          >
            Jetzt buchen
            <svg
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[12px] h-[12px]"
              aria-hidden="true"
            >
              <path d="M2 7h10M8 3l4 4-4 4" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Kategorien */}
      {leistungenKategorien.map((kat) => (
        <section
          key={kat.id}
          className="py-[60px] border-t border-line"
          aria-labelledby={`kat-${kat.id}`}
        >
          <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
            <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-brass m-0 mb-2">
              {kat.label}
            </p>
            <h2
              id={`kat-${kat.id}`}
              className="font-serif font-normal text-fg m-0 mb-3"
              style={{ fontSize: 'clamp(24px, 3vw, 36px)', letterSpacing: '-0.02em' }}
            >
              {kat.title}
            </h2>
            <p className="text-fg-soft text-[16px] leading-[1.6] m-0 mb-10 max-w-[60ch]">
              {kat.description}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {kat.services.map((svc) => {
                const Icon = iconRegistry[svc.icon];
                return (
                  <ServiceCard
                    key={svc.slug}
                    icon={<Icon />}
                    title={svc.title}
                    description={svc.description}
                    features={svc.features}
                    price={`${svc.price} ${svc.priceUnit}`}
                    href={`/leistungen/${svc.slug}`}
                  />
                );
              })}
            </div>
          </div>
        </section>
      ))}

      {/* Preishinweis */}
      <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px] py-8 border-t border-line">
        <p className="font-mono text-[12px] text-mute m-0 mb-2">
          Alle Preise sind Nettopreise gemäß § 19 UStG — kein Ausweis von Umsatzsteuer.
        </p>
        <p className="font-mono text-[12px] text-mute m-0">
          Für Unternehmenskunden (ab 3 Personen) erstelle ich gerne ein individuelles Angebot.{' '}
          <Link
            to="/kontakt"
            className="text-brass no-underline"
            style={{ borderBottom: '1px solid oklch(0.80 0.09 75 / .4)' }}
          >
            Anfrage stellen →
          </Link>
        </p>
      </div>

      <CallToAction />
    </>
  );
}
