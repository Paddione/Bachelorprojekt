import { KickerBar } from '@/components/KickerBar';
import { PageMeta } from '@/components/PageMeta';
import { SITE } from '@/content';

export function ImpressumPage() {
  return (
    <>
      <PageMeta
        title="Impressum"
        description="Angaben gemäß § 5 TMG — Anbieter, Kontakt, Verantwortlichkeiten."
        path={`${SITE.url}/impressum`}
        ogImage={SITE.ogImage}
      />
      <section className="pt-[80px] pb-[120px] max-md:pt-[56px] max-md:pb-[80px]">
        <div className="max-w-[820px] mx-auto px-10 max-md:px-[22px]">
          <KickerBar parts={['Rechtliches', 'Impressum']} className="mb-6" />
          <h1
            className="font-serif font-light text-fg leading-[1.05] m-0"
            style={{
              fontSize: 'clamp(40px, 5.4vw, 64px)',
              letterSpacing: '-0.02em',
            }}
          >
            Impressum
          </h1>
          <div className="prose mt-12 text-fg-soft text-[16px] leading-[1.7] max-w-[60ch]">
            <h2 className="font-serif text-[24px] text-fg mt-12 mb-3" style={{ letterSpacing: '-0.01em' }}>
              Angaben gemäß § 5 TMG
            </h2>
            <p className="m-0 mb-3">
              {SITE.person.name}<br />
              Coaching & Beratung<br />
              Musterstraße 1<br />
              21335 {SITE.city}
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              Kontakt
            </h2>
            <p className="m-0 mb-3">
              Telefon: +49 (0) 123 456 789<br />
              E-Mail: <a className="text-brass border-b border-brass" href={`mailto:${SITE.email}`}>{SITE.email}</a>
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              Umsatzsteuer-ID
            </h2>
            <p className="m-0 mb-3">
              Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: DE-123 456 789.
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV
            </h2>
            <p className="m-0 mb-3">
              {SITE.person.name}, Anschrift wie oben.
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              Berufsbezeichnung
            </h2>
            <p className="m-0 mb-3">
              {SITE.person.role}, verliehen in der Bundesrepublik Deutschland.
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              Streitschlichtung
            </h2>
            <p className="m-0 mb-3">
              Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:
              {' '}
              <a className="text-brass border-b border-brass" href="https://ec.europa.eu/consumers/odr/" rel="noreferrer noopener" target="_blank">
                https://ec.europa.eu/consumers/odr/
              </a>
              . Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
              Verbraucherschlichtungsstelle teilzunehmen.
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              Haftung für Inhalte
            </h2>
            <p className="m-0">
              Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten
              nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als
              Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
              Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige
              Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von
              Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine
              diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten
              Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen
              werden wir diese Inhalte umgehend entfernen.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
