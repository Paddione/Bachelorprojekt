import { KickerBar } from '@/components/KickerBar';
import { PageMeta } from '@/components/PageMeta';
import { SITE } from '@/content';

export function AgbPage() {
  return (
    <>
      <PageMeta
        title="AGB"
        description="Allgemeine Geschäftsbedingungen von mentolder.de"
        path={`${SITE.url}/agb`}
      />
      <article className="max-w-[820px] mx-auto px-10 max-md:px-[22px] pt-[80px] pb-[120px]">
        <KickerBar parts={['Rechtliches', 'AGB']} className="mb-8" />
        <h1
          className="font-serif font-light text-fg leading-[1.05] m-0 mb-8"
          style={{ fontSize: 'clamp(36px, 5vw, 56px)', letterSpacing: '-0.02em' }}
        >
          Allgemeine <em>Geschäftsbedingungen</em>
        </h1>
        <div className="text-fg-soft text-[16px] leading-[1.7]">
          <p>
            Es gelten die individuell vereinbarten Konditionen. Für Coaching- und Beratungsleistungen
            werden die Bedingungen im Rahmen einer schriftlichen Auftragsbestätigung festgehalten.
          </p>
          <h2 className="font-serif font-normal text-fg text-[24px] mt-10 mb-4">
            Kontakt
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
