import { useParams, Link } from 'react-router-dom';
import { KickerBar } from '@/components/KickerBar';
import { CallToAction } from '@/components/CallToAction';
import { FAQ } from '@/components/FAQ';
import { leistungenKategorien } from '@/content';
import { iconRegistry } from '@/components/icons';

export function LeistungDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const allServices = leistungenKategorien.flatMap((kat) =>
    kat.services.map((svc) => ({ ...svc, katLabel: kat.label })),
  );
  const idx = allServices.findIndex((s) => s.slug === slug);
  const svc = idx !== -1 ? allServices[idx] : null;

  if (!svc) {
    return (
      <section className="pt-[120px] pb-[160px] max-w-[820px] mx-auto px-10 max-md:px-[22px]">
        <h1
          className="font-serif font-light text-fg leading-[1.05] m-0"
          style={{ fontSize: 'clamp(40px, 5.4vw, 64px)', letterSpacing: '-0.02em' }}
        >
          404 — <em>nicht gefunden</em>
        </h1>
        <p className="text-fg-soft mt-5 text-[18px] leading-[1.6]">
          Dieses Angebot existiert nicht.{' '}
          <Link to="/leistungen" className="text-brass border-b border-brass">
            Alle Leistungen →
          </Link>
        </p>
      </section>
    );
  }

  const prevSvc = idx > 0 ? allServices[idx - 1] : null;
  const nextSvc = idx < allServices.length - 1 ? allServices[idx + 1] : null;
  const Icon = iconRegistry[svc.icon];
  const pc = svc.pageContent;

  return (
    <>
      {/* Hero */}
      <section className="pt-[80px] pb-[60px] max-md:pt-[56px]">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <nav aria-label="Brotkrumen" className="mb-6">
            <Link
              to="/leistungen"
              className="font-mono text-[12px] tracking-[0.06em] text-mute no-underline hover:text-brass transition-colors inline-flex items-center gap-1.5"
            >
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
                <path d="M9 2L5 7l4 5" />
              </svg>
              Alle Leistungen
            </Link>
          </nav>
          <KickerBar parts={[svc.katLabel]} className="mb-6" />
          <h1
            className="font-serif font-light text-fg leading-[1.05] m-0"
            style={{ fontSize: 'clamp(36px, 5vw, 64px)', letterSpacing: '-0.02em' }}
          >
            {pc.headline}
          </h1>
          <p className="text-[18px] leading-[1.6] text-fg-soft mt-5 max-w-[52ch]">
            {pc.intro}
          </p>
        </div>
      </section>

      {/* 2-Spalten-Layout */}
      <section className="py-[60px] border-t border-line">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px] grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-16 max-md:gap-10 items-start">
          {/* Linke Spalte */}
          <div>
            {pc.sections.map((sec) => (
              <div key={sec.title} className="mb-10">
                <h2
                  className="font-serif text-[22px] text-fg m-0 mb-4"
                  style={{ letterSpacing: '-0.015em' }}
                >
                  {sec.title}
                </h2>
                <p className="text-fg-soft text-[16px] leading-[1.7] m-0">{sec.content}</p>
              </div>
            ))}
            {pc.forWhom.length > 0 && (
              <div className="mt-2">
                <h2
                  className="font-serif text-[22px] text-fg m-0 mb-4"
                  style={{ letterSpacing: '-0.015em' }}
                >
                  Für wen?
                </h2>
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                  {pc.forWhom.map((item) => (
                    <li
                      key={item}
                      className="flex items-baseline gap-3 text-[15px] text-fg-soft"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-brass flex-shrink-0"
                        style={{ transform: 'translateY(2px)' }}
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sticky Sidebar */}
          <aside className="md:sticky md:top-[96px] rounded-xl border border-line-2 bg-ink-850 p-7">
            <div className="w-10 h-10 text-brass mb-5" aria-hidden="true">
              <Icon />
            </div>
            <div className="mb-5">
              <span
                className="font-serif text-[36px] text-brass"
                style={{ letterSpacing: '-0.02em' }}
              >
                {svc.price}
              </span>
              <span className="text-mute text-[14px] ml-2">{svc.priceUnit}</span>
            </div>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5 mb-7">
              {svc.features.map((f) => (
                <li
                  key={f}
                  className="flex items-baseline gap-2.5 text-[14px] text-fg-soft"
                >
                  <svg
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5 flex-shrink-0 text-brass"
                    style={{ transform: 'translateY(1px)' }}
                    aria-hidden="true"
                  >
                    <path d="M2 7l4 4 6-7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to={`/kontakt?service=${svc.slug}`}
              className="block text-center text-ink-900 font-medium no-underline py-3 rounded-full mb-4 transition-colors"
              style={{ background: 'var(--brass)', fontSize: '14px' }}
            >
              Kontakt aufnehmen
            </Link>
            <p className="font-mono text-[11px] text-mute text-center m-0">
              Nettopreis gem. §19 UStG
            </p>
          </aside>
        </div>
      </section>

      {/* FAQ */}
      {pc.faq.length > 0 && <FAQ items={pc.faq} />}

      {/* Prev / Next */}
      {(prevSvc || nextSvc) && (
        <section className="py-[60px] border-t border-line">
          <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px] grid grid-cols-1 md:grid-cols-2 gap-4">
            {prevSvc ? (
              <Link
                to={`/leistungen/${prevSvc.slug}`}
                className="rounded-xl border border-line-2 bg-ink-850 p-6 no-underline group hover:border-brass/40 transition-colors"
              >
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-mute m-0 mb-2">
                  ← Vorheriges
                </p>
                <p className="font-serif text-[18px] text-fg m-0 group-hover:text-brass transition-colors">
                  {prevSvc.title}
                </p>
              </Link>
            ) : (
              <div />
            )}
            {nextSvc && (
              <Link
                to={`/leistungen/${nextSvc.slug}`}
                className="rounded-xl border border-line-2 bg-ink-850 p-6 no-underline group hover:border-brass/40 transition-colors text-right"
              >
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-mute m-0 mb-2">
                  Nächstes →
                </p>
                <p className="font-serif text-[18px] text-fg m-0 group-hover:text-brass transition-colors">
                  {nextSvc.title}
                </p>
              </Link>
            )}
          </div>
        </section>
      )}

      <CallToAction />
    </>
  );
}
