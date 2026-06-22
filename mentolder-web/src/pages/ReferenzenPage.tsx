import { Link } from 'react-router-dom';
import { KickerBar } from '@/components/KickerBar';
import { referenzenConfig } from '@/content';

export function ReferenzenPage() {
  const { subheading, types, items } = referenzenConfig;

  const knownTypeIds = new Set(types.map((t) => t.id));
  const groups = types.map((t) => ({
    id: t.id,
    label: t.label,
    items: items.filter((i) => i.type === t.id),
  }));
  const untyped = items.filter((i) => !i.type || !knownTypeIds.has(i.type));
  if (untyped.length > 0) {
    groups.push({ id: '__untyped__', label: 'Weitere', items: untyped });
  }
  const populatedGroups = groups.filter((g) => g.items.length > 0);
  const hasGrouping =
    populatedGroups.length > 1 ||
    (populatedGroups.length === 1 && populatedGroups[0].id !== '__untyped__');

  return (
    <>
      {/* Hero */}
      <section className="pt-[80px] pb-[60px] max-md:pt-[56px]">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <KickerBar parts={['Referenzen', 'Vertrauen']} className="mb-6" />
          <h1
            className="font-serif font-light text-fg leading-[1.05] m-0"
            style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', letterSpacing: '-0.02em' }}
          >
            Unternehmen und Menschen, <em>die mir vertrauen.</em>
          </h1>
          <p className="text-[18px] leading-[1.6] text-fg-soft mt-5 max-w-[52ch]">
            {subheading}
          </p>
        </div>
      </section>

      {/* Grid */}
      <section className="py-[60px] border-t border-line">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          {populatedGroups.length === 0 ? (
            <p className="text-center text-mute text-[16px] py-20">
              Referenzen werden demnächst ergänzt.
            </p>
          ) : (
            <div className="flex flex-col gap-14">
              {populatedGroups.map((group) => (
                <div key={group.id}>
                  {hasGrouping && (
                    <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase text-brass m-0 mb-6 pb-3 border-b border-line">
                      {group.label}
                    </h2>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {group.items.map((ref) => (
                      <div
                        key={ref.name}
                        className="p-6 bg-ink-850 rounded-xl border border-line-2 hover:border-brass/30 transition-colors flex flex-col gap-3"
                      >
                        {ref.logoUrl ? (
                          <img
                            src={ref.logoUrl}
                            alt={`Logo ${ref.name}`}
                            className="h-10 w-auto object-contain opacity-80"
                          />
                        ) : (
                          <div
                            className="w-10 h-10 rounded-lg text-ink-900 flex items-center justify-center font-bold text-[15px] flex-shrink-0"
                            style={{ background: 'var(--brass)' }}
                            aria-hidden="true"
                          >
                            {ref.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          {ref.url ? (
                            <a
                              href={ref.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-fg font-medium no-underline hover:text-brass transition-colors text-[15px]"
                            >
                              {ref.name}
                            </a>
                          ) : (
                            <span className="text-fg font-medium text-[15px]">{ref.name}</span>
                          )}
                          {ref.description && (
                            <p className="text-mute text-[13px] leading-[1.5] m-0 mt-1">
                              {ref.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Leiser Abschluss */}
          <div className="mt-16 text-center">
            <p className="text-fg-soft text-[16px] m-0 mb-5">
              Interesse an einer Zusammenarbeit?
            </p>
            <Link
              to="/kontakt"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border text-brass no-underline text-[14px] font-medium hover:bg-brass hover:text-ink-900 transition-colors"
              style={{ borderColor: 'var(--brass)' }}
            >
              Jetzt Kontakt aufnehmen
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
