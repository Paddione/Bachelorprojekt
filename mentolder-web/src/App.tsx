import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { KontaktPage } from './pages/KontaktPage';
import { ImpressumPage } from './pages/ImpressumPage';
import { DatenschutzPage } from './pages/DatenschutzPage';
import { UeberMichPage } from './pages/UeberMichPage';
import { LeistungenPage } from './pages/LeistungenPage';
import { LeistungDetailPage } from './pages/LeistungDetailPage';
import { ReferenzenPage } from './pages/ReferenzenPage';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Navigation />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/kontakt" element={<KontaktPage />} />
          <Route path="/impressum" element={<ImpressumPage />} />
          <Route path="/datenschutz" element={<DatenschutzPage />} />
          <Route path="/ueber-mich" element={<UeberMichPage />} />
          <Route path="/leistungen" element={<LeistungenPage />} />
          <Route path="/leistungen/:slug" element={<LeistungDetailPage />} />
          <Route path="/referenzen" element={<ReferenzenPage />} />
          <Route
            path="*"
            element={
              <section className="pt-[120px] pb-[160px] max-w-[820px] mx-auto px-10 max-md:px-[22px]">
                <h1
                  className="font-serif font-light text-fg leading-[1.05] m-0"
                  style={{
                    fontSize: 'clamp(40px, 5.4vw, 64px)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  404 — <em>nicht gefunden</em>
                </h1>
                <p className="text-fg-soft mt-5 text-[18px] leading-[1.6]">
                  Diese Seite existiert (noch) nicht. Zurück zur{' '}
                  <a href="/" className="text-brass border-b border-brass">
                    Startseite
                  </a>
                  .
                </p>
              </section>
            }
          />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
