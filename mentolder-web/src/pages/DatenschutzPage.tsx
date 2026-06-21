import { KickerBar } from '@/components/KickerBar';
import { PageMeta } from '@/components/PageMeta';
import { SITE } from '@/content';

export function DatenschutzPage() {
  return (
    <>
      <PageMeta
        title="Datenschutzerklärung"
        description="Informationen zur Verarbeitung personenbezogener Daten auf mentolder.de."
        path={`${SITE.url}/datenschutz`}
        ogImage={SITE.ogImage}
      />
      <section className="pt-[80px] pb-[120px] max-md:pt-[56px] max-md:pb-[80px]">
        <div className="max-w-[820px] mx-auto px-10 max-md:px-[22px]">
          <KickerBar parts={['Rechtliches', 'Datenschutz']} className="mb-6" />
          <h1
            className="font-serif font-light text-fg leading-[1.05] m-0"
            style={{
              fontSize: 'clamp(40px, 5.4vw, 64px)',
              letterSpacing: '-0.02em',
            }}
          >
            Datenschutz&shy;erklärung
          </h1>
          <div className="prose mt-12 text-fg-soft text-[16px] leading-[1.7] max-w-[60ch]">
            <h2 className="font-serif text-[24px] text-fg mt-12 mb-3" style={{ letterSpacing: '-0.01em' }}>
              1. Datenschutz auf einen Blick
            </h2>
            <p>
              Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren
              personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene
              Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              2. Verantwortlicher
            </h2>
            <p>
              Verantwortlich für die Datenverarbeitung auf dieser Website ist:<br />
              {SITE.person.name}<br />
              Musterstraße 1<br />
              21335 {SITE.city}<br />
              E-Mail: <a className="text-brass border-b border-brass" href={`mailto:${SITE.email}`}>{SITE.email}</a>
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              3. Welche Daten erfassen wir?
            </h2>
            <p>
              Beim Besuch dieser Website werden automatisch Informationen wie Ihre IP-Adresse,
              der verwendete Browsertyp, das Betriebssystem, die Referrer-URL und der Zeitpunkt
              der Serveranfrage verarbeitet (sog. Server-Logfiles). Diese Daten dienen dem
              stabilen und sicheren Betrieb der Website.
            </p>
            <p>
              Wenn Sie uns per Kontaktformular eine Anfrage senden, werden Ihre Angaben aus dem
              Formular inklusive der von Ihnen dort angegebenen Kontaktdaten zwecks Bearbeitung
              der Anfrage und für den Fall von Anschlussfragen bei uns gespeichert. Diese Daten
              geben wir nicht ohne Ihre Einwilligung weiter.
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              4. Cookies & lokale Speicherung
            </h2>
            <p>
              Diese Website setzt ausschließlich technisch notwendige Speicherwerte. Es kommen
              keine Tracking-Cookies, keine Analyse- oder Werbe-Cookies zum Einsatz. Sie können
              Ihren Browser so konfigurieren, dass er Sie über die Platzierung von Cookies
              informiert oder Cookies ablehnt.
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              5. Hosting
            </h2>
            <p>
              Diese Website wird bei einem europäischen Anbieter statisch ausgeliefert (CDN /
              Edge-Network). Beim Aufruf der Seite werden technische Metadaten (IP-Adresse,
              Zeitstempel, User-Agent) verarbeitet, um die Auslieferung zu ermöglichen und
              Angriffe abzuwehren.
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              6. Ihre Rechte
            </h2>
            <p>
              Sie haben jederzeit das Recht auf Auskunft über Ihre gespeicherten
              personenbezogenen Daten, deren Herkunft und Empfänger und den Zweck der
              Datenverarbeitung. Sie haben außerdem ein Recht auf Berichtigung, Löschung,
              Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Wenn Sie
              Fragen zum Datenschutz haben, schreiben Sie uns bitte an die oben genannte
              E-Mail-Adresse.
            </p>

            <h2 className="font-serif text-[24px] text-fg mt-10 mb-3" style={{ letterSpacing: '-0.01em' }}>
              7. SSL-Verschlüsselung
            </h2>
            <p>
              Diese Seite nutzt aus Sicherheitsgründen und zum Schutz der Übertragung
              vertraulicher Inhalte eine SSL-Verschlüsselung. Eine verschlüsselte Verbindung
              erkennen Sie daran, dass die Adresszeile des Browsers von „http://" auf „https://"
              wechselt und an dem Schloss-Symbol in Ihrer Browserzeile.
            </p>

            <p className="text-[12px] text-mute mt-10">
              Stand: {new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long' })} ·
              Platzhalter — finale Fassung wird bei Live-Gang durch das Justiziariat
              freigegeben.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
