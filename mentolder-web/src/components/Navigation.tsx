import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

const links: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/#angebote', label: 'Angebote' },
  { to: '/ueber-mich', label: 'Über mich' },
  { to: '/referenzen', label: 'Referenzen' },
  { to: '/kontakt', label: 'Kontakt' },
];

const BRAND_NAME = (import.meta.env.VITE_BRAND_NAME ?? 'mentolder').toLowerCase();
const LOCATION_LABEL = import.meta.env.VITE_NAV_LOCATION ?? 'Lüneburg, Hamburg und Umgebung · DE';

export function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-line/60 backdrop-saturate-110"
      style={{
        background: 'linear-gradient(to bottom, rgba(11,17,28,0.92), rgba(11,17,28,0.72))',
        backdropFilter: 'blur(14px) saturate(1.1)',
      }}
      aria-label="Hauptnavigation"
    >
      <div className="nav-wrap max-w-[1240px] mx-auto px-10 max-md:px-[22px] flex items-center justify-between gap-6 h-[72px]">
        {/* Brand mark */}
        <Link
          to="/"
          className="brand flex items-center gap-2.5 no-underline"
          aria-label={`${BRAND_NAME} Startseite`}
        >
          <span
            className="mark w-8 h-8 rounded-lg flex items-center justify-center font-bold text-ink-900 text-base flex-shrink-0"
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
          <span className="brand-name font-serif text-[18px] text-fg" style={{ letterSpacing: '-0.01em' }}>
            {BRAND_NAME}
            <span className="text-brass">.</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav
          className="hidden md:flex items-center gap-[34px]"
          aria-label="Hauptmenü"
        >
          {links.map((link) =>
            link.to.startsWith('/#') ? (
              <a
                key={link.to}
                href={link.to}
                className="text-[14px] font-medium no-underline transition-colors text-fg-soft hover:text-fg"
              >
                {link.label}
              </a>
            ) : (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `text-[14px] font-medium no-underline transition-colors ${
                    isActive ? 'text-brass' : 'text-fg-soft hover:text-fg'
                  }`
                }
                end
              >
                {link.label}
              </NavLink>
            )
          )}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <span className="font-mono text-[11px] letter-spacing-[0.06em] text-mute">
            {LOCATION_LABEL}
          </span>
          <Link
            to="/kontakt"
            className="inline-flex items-center gap-2 no-underline text-ink-900 font-medium"
            style={{
              fontSize: '13px',
              padding: '10px 16px',
              borderRadius: '999px',
              background: 'var(--brass)',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--brass-2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--brass)'; }}
          >
            Kostenloses Erstgespräch
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[12px] h-[12px]" aria-hidden="true">
              <path d="M2 7h10M8 3l4 4-4 4" />
            </svg>
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded border border-line-2 text-fg"
          aria-label={mobileOpen ? 'Menü schließen' : 'Menü öffnen'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
            {mobileOpen ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
      </div>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className="md:hidden border-t border-line bg-ink-900/95 backdrop-blur-md">
          <nav className="px-[22px] py-4 flex flex-col gap-1" aria-label="Mobiles Hauptmenü">
            {links.map((link) =>
              link.to.startsWith('/#') ? (
                <a
                  key={link.to}
                  href={link.to}
                  className="py-3 px-2 rounded text-fg-soft hover:text-fg no-underline font-medium text-[15px]"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.to}
                  to={link.to}
                  className="py-3 px-2 rounded text-fg-soft hover:text-fg no-underline font-medium text-[15px]"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
