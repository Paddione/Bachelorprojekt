import { KickerBar } from '@/components/KickerBar';
import { PageMeta } from '@/components/PageMeta';
import { SITE } from '@/content';

export function MeineDatenPage() {
  return (
    <>
      <PageMeta
        title="Meine Daten"
        description="Auskunft und Löschung Ihrer Daten — mentolder.de"
        path={`${SITE.url}/meine-daten`}
      />
      <article className="max-w-[820px] mx-auto px-10 max-md:px-[22px] pt-[80px] pb-[120px]">
        <KickerBar parts={['Datenschutz', 'Meine Daten']} className="mb-8" />
        <h1
          className="font-serif font-light text-fg leading-[1.05] m-0 mb-8"
          style={{ fontSize: 'clamp(36px, 5vw, 56px)', letterSpacing: '-0.02em' }}
        >
          Ihre <em>Datenschutzrechte</em>
        </h1>
        <div className="text-fg-soft text-[16px] leading-[1.7]">
          <p>
            Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung
            Ihrer personenbezogenen Daten (Art. 15–18 DSGVO).
          </p>
          <h2 className="font-serif font-normal text-fg text-[24px] mt-10 mb-4">
            Anfrage stellen
          </h2>
          <p>
            Senden Sie Ihre Anfrage per E-Mail an:{' '}
            <a href={`mailto:${SITE.email}`} className="text-brass no-underline border-b border-brass">
              {SITE.email}
            </a>
          </p>
          <p>
            Wir bearbeiten Ihre Anfrage innerhalb von 30 Tagen gemäß DSGVO Art. 12.
          </p>
          <h2 className="font-serif font-normal text-fg text-[24px] mt-10 mb-4">
            Verantwortlicher
          </h2>
          <p>
            Gerald Korczewski<br />
            {SITE.city}<br />
            E-Mail:{' '}
            <a href={`mailto:${SITE.email}`} className="text-brass no-underline border-b border-brass">
              {SITE.email}
            </a>
          </p>
        </div>
      </article>
    </>
  );
}
