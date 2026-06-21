import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

const links: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/#angebote', label: 'Angebote' },
  { to: '/ueber-mich', label: 'Über mich' },
  { to: '/referenzen', label: 'Referenzen' },
  { to: '/kontakt', label: 'Kontakt' },
];

const BRAND_NAME = (import.meta.env.VITE_BRAND_NAME ?? 'mentolder').toLowerCase();
const LOCATION_LABEL = import.meta.env.VITE_CONTACT_CITY ?? 'Lüneburg';

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-200 ${
        scrolled
          ? 'bg-ink-900/80 backdrop-blur-md border-line'
          : 'bg-ink-900/0 border-transparent'
      }`}
      aria-label="Hauptnavigation"
    >
      <div className="nav-wrap max-w-[1240px] mx-auto px-10 max-md:px-[22px] flex items-center justify-between gap-6 h-[68px]">
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
          className="hidden md:flex items-center gap-7"
          aria-label="Hauptmenü"
        >
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-[14px] font-medium no-underline transition-colors ${
                  isActive
                    ? 'text-brass'
                    : 'text-fg-soft hover:text-fg'
                }`
              }
              end={link.to === '/'}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-mute-2">
            {LOCATION_LABEL}
          </span>
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
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="py-3 px-2 rounded text-fg-soft hover:text-fg no-underline font-medium text-[15px]"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
