import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { KickerBar } from './KickerBar';
import { Portrait } from './Portrait';
import heroHalo from '@/assets/hero-halo.svg';

interface HeroProps {
  title?: string;
  titleEmphasis?: string;
  subtitle?: string;
  tagline?: string;
  avatarType?: 'image' | 'initials';
  avatarSrc?: string;
  avatarInitials?: string;
  personName?: string;
  personRole?: string;
}

export function Hero({
  title = 'Menschen, Prozesse und Technik',
  titleEmphasis = 'der Mensch und Technologie wieder verbindet.',
  subtitle = 'Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe.',
  tagline = 'Digital Coach & Führungskräfte-Mentor',
  avatarType = 'initials',
  avatarSrc,
  avatarInitials = '',
  personName = '',
  personRole = '',
}: HeroProps) {
  const kickerParts = tagline
    .split(/[·&]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <section
      className="relative pt-[76px] pb-[120px] border-b border-line"
      aria-label="Hero-Bereich"
    >
      {/* Background halo atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        <img
          src={heroHalo}
          alt=""
          aria-hidden="true"
          className="absolute right-[-20%] top-[-30%] w-[90vw] h-[90vw] max-w-none object-cover pointer-events-none"
          style={{ filter: 'blur(10px)' }}
        />
        <div
          className="absolute left-[-30%] bottom-[-40%] w-[80vw] h-[80vw] pointer-events-none"
          style={{
            background:
              'radial-gradient(closest-side, oklch(0.60 0.05 250 / .25), transparent 70%)',
          }}
        />
      </div>

      <div className="wrap relative z-[2]">
        <div className="grid">
          <div className="hero-copy flex flex-col">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <KickerBar parts={kickerParts} className="mb-[26px]" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="font-serif font-light leading-[1.02] text-fg m-0"
              style={{
                fontSize: 'clamp(44px, 6.2vw, 88px)',
                letterSpacing: '-0.02em',
              }}
            >
              {title}
              {titleEmphasis && (
                <>
                  {' '}
                  <em>{titleEmphasis}</em>
                </>
              )}
            </motion.h1>

            <p className="lede mt-5 text-[18px] leading-[1.6] text-fg-soft max-w-[52ch]">
              {subtitle}
            </p>

            <div className="hero-cta flex flex-wrap gap-[14px] mt-9" role="group" aria-label="Aktionen">
              <Link to="/kontakt" className="btn-primary">
                Kostenloses Erstgespräch
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
              <a href="/#angebote" className="btn-ghost">
                Angebote ansehen
              </a>
            </div>
          </div>

          {avatarType && (
            <div className="hero-portrait flex items-end justify-end">
              <Portrait
                avatarType={avatarType}
                avatarSrc={avatarSrc}
                avatarInitials={avatarInitials}
                name={personName}
                role={personRole}
              />
            </div>
          )}
        </div>
      </div>

      <style>{`
        .wrap {
          max-width: var(--maxw);
          margin: 0 auto;
          padding: 0 40px;
        }
        .grid {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 64px;
          align-items: end;
        }
        .btn-primary,
        .btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 22px;
          border-radius: 999px;
          font-family: var(--sans);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: transform .2s ease, background .2s ease, border-color .2s ease, color .2s ease;
        }
        .btn-primary {
          background: var(--brass);
          color: var(--ink-900);
        }
        .btn-primary:hover {
          background: var(--brass-2);
          transform: translateY(-1px);
        }
        .btn-ghost {
          color: var(--fg);
          border: 1px solid var(--line-2);
          background: transparent;
        }
        .btn-ghost:hover {
          border-color: var(--brass);
          color: var(--brass);
        }
        h1 em {
          font-style: italic;
          font-weight: 400;
          color: var(--brass-2);
        }
        @media (max-width: 960px) {
          section { padding: 56px 0 80px; }
          .grid { grid-template-columns: 1fr; gap: 56px; }
          .hero-portrait { justify-content: center; }
          .wrap { padding: 0 22px; }
        }
      `}</style>
    </section>
  );
}
