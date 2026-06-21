import { ContactForm } from '@/components/ContactForm';
import { KickerBar } from '@/components/KickerBar';
import { PageMeta } from '@/components/PageMeta';
import { CallToAction } from '@/components/CallToAction';
import { SITE } from '@/content';

export function KontaktPage() {
  return (
    <>
      <PageMeta
        title="Kontakt"
        description="In 30 Minuten finden wir heraus, ob eine Zusammenarbeit passt. Kostenlos, unverbindlich, ohne Verkaufsdruck."
        path={`${SITE.url}/kontakt`}
        ogImage={SITE.ogImage}
      />

      <section className="relative pt-[80px] pb-[120px] max-md:pt-[56px] max-md:pb-[80px]">
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="absolute -top-[180px] -right-[120px] w-[620px] h-[620px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, oklch(0.80 0.09 75 / .14), transparent 65%)',
              filter: 'blur(18px)',
            }}
          />
        </div>
        <div className="relative max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <div className="max-w-[820px]">
            <KickerBar parts={['Kontakt', SITE.city, 'DE']} className="mb-6" />
            <h1
              className="font-serif font-light text-fg leading-[1.05] m-0"
              style={{
                fontSize: 'clamp(40px, 5.4vw, 72px)',
                letterSpacing: '-0.02em',
              }}
            >
              In 30 Minuten <em>wissen wir, ob es passt.</em>
            </h1>
            <p className="lede text-[18px] leading-[1.6] text-fg-soft mt-5 max-w-[52ch]">
              Schreiben Sie mir kurz, worum es geht — ich antworte innerhalb von 48 Stunden
              persönlich. Kein Ticket-System, keine Warteschleife, kein Newsletter.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-16 mt-16 max-md:gap-10 max-md:mt-10 items-start">
            <div>
              <ContactForm />
            </div>

            <aside className="rounded-card border border-line-2 bg-ink-850 p-7">
              <h3 className="font-serif text-[20px] text-fg m-0 mb-4" style={{ letterSpacing: '-0.01em' }}>
                Direkter Draht
              </h3>
              <ul className="list-none p-0 m-0 flex flex-col gap-3">
                <li>
                  <a
                    href={`mailto:${SITE.email}`}
                    className="text-brass text-[15px] no-underline border-b border-brass"
                  >
                    {SITE.email}
                  </a>
                </li>
                <li>
                  <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-mute">
                    {SITE.person.name}
                  </span>
                </li>
                <li>
                  <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-mute">
                    {SITE.person.role}
                  </span>
                </li>
                <li>
                  <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-mute">
                    {SITE.city} · DE
                  </span>
                </li>
              </ul>

              <div className="border-t border-line mt-6 pt-6">
                <h4 className="font-mono text-[11px] tracking-[0.16em] uppercase text-brass m-0 mb-3">
                  So läuft's
                </h4>
                <ol className="list-none p-0 m-0 flex flex-col gap-3 text-[14px] text-fg-soft">
                  <li className="grid grid-cols-[28px_1fr] gap-3 items-start">
                    <span className="font-mono text-[11px] text-brass pt-0.5">01</span>
                    Sie schreiben mir.
                  </li>
                  <li className="grid grid-cols-[28px_1fr] gap-3 items-start">
                    <span className="font-mono text-[11px] text-brass pt-0.5">02</span>
                    Ich antworte innerhalb von 48 Stunden.
                  </li>
                  <li className="grid grid-cols-[28px_1fr] gap-3 items-start">
                    <span className="font-mono text-[11px] text-brass pt-0.5">03</span>
                    Kostenloses 30-Minuten-Erstgespräch.
                  </li>
                  <li className="grid grid-cols-[28px_1fr] gap-3 items-start">
                    <span className="font-mono text-[11px] text-brass pt-0.5">04</span>
                    Wir entscheiden gemeinsam, ob es weitergeht.
                  </li>
                </ol>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <CallToAction
        eyebrow="Lieber direkt?"
        title="Schreiben Sie mir eine"
        titleEmphasis="kurze E-Mail."
        subtitle="Manchmal ist eine Mail der einfachste Weg. Antwort kommt persönlich."
        primaryText="E-Mail öffnen"
        primaryHref={`mailto:${SITE.email}`}
      />
    </>
  );
}
