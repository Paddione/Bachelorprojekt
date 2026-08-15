import { Link } from 'react-router-dom';

interface CallToActionProps {
  eyebrow?: string;
  title?: string;
  titleEmphasis?: string;
  subtitle?: string;
  primaryText?: string;
  primaryHref?: string;
  secondaryText?: string;
  secondaryHref?: string;
}

export function CallToAction({
  eyebrow = 'Bereit?',
  title = 'Lassen Sie uns',
  titleEmphasis = 'in 30 Minuten herausfinden, ob es passt.',
  subtitle = 'Ein kostenloses Erstgespräch — unverbindlich, auf Augenhöhe und ohne Verkaufsdruck.',
  primaryText = 'Termin vereinbaren',
  primaryHref = '/kontakt',
  secondaryText = '',
  secondaryHref = '',
}: CallToActionProps) {
  return (
    <section
      className="py-[130px] border-t border-line relative overflow-hidden"
      aria-labelledby="cta-heading"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse at 50% 100%, oklch(0.80 0.09 75 / .22), transparent 60%)',
        }}
      />
      <div className="max-w-[760px] mx-auto px-10 text-center relative z-[1] max-md:px-[22px]">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-brass inline-flex items-center gap-2.5 m-0 mb-4">
          <span aria-hidden="true" className="inline-block w-[22px] h-px bg-current opacity-80" />
          {eyebrow}
        </p>
        <h2
          id="cta-heading"
          className="font-serif font-normal text-fg leading-[1.1] m-0"
          style={{
            fontSize: 'clamp(36px, 4.6vw, 60px)',
            letterSpacing: '-0.02em',
            fontWeight: 350,
          }}
        >
          {title}
          {titleEmphasis && (
            <>
              {' '}
              <em>{titleEmphasis}</em>
            </>
          )}
        </h2>
        <p className="text-[18px] leading-[1.6] text-fg-soft mt-5 mb-9 max-w-[52ch] mx-auto">
          {subtitle}
        </p>
        <div className="flex flex-wrap justify-center gap-[14px]" role="group" aria-label="Aktionen">
          <Link to={primaryHref} className="btn-primary">
            {primaryText}
            <svg
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="w-[14px] h-[14px]"
            >
              <path d="M2 7h10M8 3l4 4-4 4" />
            </svg>
          </Link>
          {secondaryText && (
            <a href={secondaryHref || '#'} className="btn-ghost">
              {secondaryText}
            </a>
          )}
        </div>
      </div>

      <style>{`
        .btn-primary, .btn-ghost {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 14px 22px; border-radius: 999px;
          font-family: var(--sans); font-size: 14px; font-weight: 600;
          text-decoration: none;
          transition: transform .2s ease, background .2s ease, border-color .2s ease, color .2s ease;
        }
        .btn-primary { background: var(--brass); color: var(--ink-900); }
        .btn-primary:hover { background: var(--brass-2); transform: translateY(-1px); box-shadow: 0 0 28px oklch(0.80 0.09 75 / 0.45); }
        .btn-ghost { color: var(--fg); border: 1px solid var(--line-2); background: transparent; }
        .btn-ghost:hover { border-color: var(--brass); color: var(--brass); }
        h2 em { font-style: italic; font-weight: 400; color: var(--brass-2); }
      `}</style>
    </section>
  );
}
