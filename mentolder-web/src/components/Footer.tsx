import { Link } from 'react-router-dom';

const BRAND_NAME = (import.meta.env.VITE_BRAND_NAME ?? 'mentolder').toLowerCase();
const EMAIL = import.meta.env.VITE_CONTACT_EMAIL ?? 'mail@mentolder.de';
const PHONE = import.meta.env.VITE_CONTACT_PHONE ?? '';
const CITY = import.meta.env.VITE_CONTACT_CITY ?? 'Lüneburg';
const TAGLINE = 'Digital Coaching & Führungskräfte-Beratung';

const serviceLinks = [
  { label: '65+ digital', href: '/leistungen/50plus-digital' },
  { label: 'Coaching für Führungskräfte und Menschen in Verantwortung', href: '/leistungen/coaching' },
  { label: 'Führung & Persönlichkeit', href: '/leistungen/fuehrung-persoenlichkeit' },
  { label: 'Unternehmensberatung', href: '/leistungen/beratung' },
  { label: 'KI-Transition Coaching', href: '/leistungen/ki-transition' },
];

const rechtLinks = [
  { label: 'Referenzen', href: '/referenzen' },
  { label: 'Impressum', href: '/impressum' },
  { label: 'Datenschutz', href: '/datenschutz' },
  { label: 'Meine Daten', href: '/meine-daten' },
  { label: 'AGB', href: '/agb' },
  { label: 'Barrierefreiheit', href: '/barrierefreiheit' },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-ink-850 border-t border-line pt-[72px] pb-9">
      <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-12 mb-14">
          {/* Brand col */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-ink-900 text-sm flex-shrink-0"
                style={{
                  background:
                    'radial-gradient(circle at 30% 30%, var(--brass-2), var(--brass) 55%, #8a6a2a 100%)',
                  boxShadow:
                    'inset 0 0 0 1px rgba(255,255,255,.2), 0 0 0 1px rgba(0,0,0,.3)',
                }}
                aria-hidden="true"
              >
                {BRAND_NAME.charAt(0)}
              </span>
              <span className="font-serif text-[18px] text-fg" style={{ letterSpacing: '-0.01em' }}>
                {BRAND_NAME}
                <span className="text-brass">.</span>
              </span>
            </div>
            <p className="text-[14px] text-fg-soft max-w-[32ch] leading-[1.6] m-0">{TAGLINE}</p>
          </div>

          {/* Kontakt col */}
          <div>
            <h5 className="font-mono text-[11px] tracking-[0.16em] uppercase text-brass m-0 mb-[18px]">
              Kontakt
            </h5>
            <ul className="list-none p-0 m-0">
              {PHONE && (
                <li className="mb-2">
                  <a
                    href={`tel:${PHONE.replace(/\s/g, '')}`}
                    className="text-[14px] text-mute no-underline transition-colors duration-150 hover:text-fg"
                  >
                    {PHONE}
                  </a>
                </li>
              )}
              <li className="mb-2">
                <a
                  href={`mailto:${EMAIL}`}
                  className="text-[14px] text-mute no-underline transition-colors duration-150 hover:text-fg"
                >
                  {EMAIL}
                </a>
              </li>
              <li>
                <span className="text-[14px] text-mute">{CITY}</span>
              </li>
            </ul>
          </div>

          {/* Angebote col */}
          <div>
            <h5 className="font-mono text-[11px] tracking-[0.16em] uppercase text-brass m-0 mb-[18px]">
              Angebote
            </h5>
            <ul className="list-none p-0 m-0">
              {serviceLinks.map((s) => (
                <li key={s.href} className="mb-2">
                  <Link
                    to={s.href}
                    className="text-[14px] text-mute no-underline transition-colors duration-150 hover:text-fg"
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Rechtliches col */}
          <div>
            <h5 className="font-mono text-[11px] tracking-[0.16em] uppercase text-brass m-0 mb-[18px]">
              Rechtliches
            </h5>
            <ul className="list-none p-0 m-0">
              {rechtLinks.map((l) => (
                <li key={l.href} className="mb-2">
                  <Link
                    to={l.href}
                    className="text-[14px] text-mute no-underline transition-colors duration-150 hover:text-fg"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-line pt-6 flex flex-wrap justify-between items-center gap-2">
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-mute-2 m-0">
            © {year} {BRAND_NAME} — Alle Rechte vorbehalten
          </p>
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-mute-2 m-0">
            Gestaltet in {CITY} · DE
          </p>
        </div>
      </div>
    </footer>
  );
}
