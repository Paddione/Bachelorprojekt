import { KickerBar } from '@/components/KickerBar';
import { PageMeta } from '@/components/PageMeta';
import { SITE } from '@/content';

export function BarrierefreiheitPage() {
  return (
    <>
      <PageMeta
        title="Barrierefreiheit"
        description="Erklärung zur Barrierefreiheit von mentolder.de"
        path={`${SITE.url}/barrierefreiheit`}
      />
      <article className="max-w-[820px] mx-auto px-10 max-md:px-[22px] pt-[80px] pb-[120px]">
        <KickerBar parts={['Rechtliches', 'Barrierefreiheit']} className="mb-8" />
        <h1
          className="font-serif font-light text-fg leading-[1.05] m-0 mb-8"
          style={{ fontSize: 'clamp(36px, 5vw, 56px)', letterSpacing: '-0.02em' }}
        >
          Erklärung zur <em>Barrierefreiheit</em>
        </h1>
        <div className="prose prose-invert text-fg-soft text-[16px] leading-[1.7] max-w-none">
          <p>
            Diese Website bemüht sich, die Anforderungen der Web Content Accessibility Guidelines (WCAG)
            2.1 zu erfüllen. Wir arbeiten kontinuierlich daran, die Zugänglichkeit zu verbessern.
          </p>
          <h2 className="font-serif font-normal text-fg text-[24px] mt-10 mb-4">
            Bekannte Einschränkungen
          </h2>
          <p>
            Sollten Sie auf Barrieren stoßen, kontaktieren Sie uns bitte unter{' '}
            <a href={`mailto:${SITE.email}`} className="text-brass no-underline border-b border-brass">
              {SITE.email}
            </a>
            .
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
