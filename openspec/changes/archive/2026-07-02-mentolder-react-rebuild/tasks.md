---
title: "mentolder.de Website-Frontend in React neu aufbauen"
ticket_id: T001026
domains: [website/mentolder]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mentolder React Rebuild — Implementation Plan

Portiert die öffentliche mentolder.de Website von Svelte/Astro auf ein eigenständiges
React 19 + Vite-Paket. Design-System bleibt 1:1 erhalten (Dark-Mode, Brass-Akzent, Newsreader/Geist).

---

## File Structure

```
mentolder-web/
  src/
    components/
      Hero.tsx · ServiceCard.tsx · ServiceRow.tsx
      WhyMeStats.tsx · FAQ.tsx · ContactForm.tsx
      Footer.tsx · Portrait.tsx · KickerBar.tsx
    pages/
      HomePage.tsx · KontaktPage.tsx
      ImpressumPage.tsx · DatenschutzPage.tsx
    assets/
      hero-halo.svg · favicon.svg · icons/*.svg
    styles/
      tokens.css · global.css
    App.tsx · main.tsx
  tailwind.config.css
  vite.config.ts · tsconfig.json · package.json
```

---

## Aufgabe 1: Projekt-Setup

- [x] **M1 — Setup (Blocker für alle):** Vite + React 19 + TypeScript strict + Tailwind v4
  Scaffold mit mentolder-Design-Tokens. `pnpm tsc --noEmit` und `pnpm run build` grün.

**Ziel:** Vite + React 19 + TypeScript + Tailwind v4 Scaffold mit mentolder-Design-Tokens.

**Implementierung:**

```bash
npm create vite@latest mentolder-web -- --template react-ts
cd mentolder-web
npm install react-router-dom framer-motion react-hook-form zod @hookform/resolvers
npm install -D tailwindcss @tailwindcss/vite
```

`tailwind.config.css` — `@theme` mit allen Tokens aus `design-system.md`:

```css
@import "tailwindcss";

@theme {
  --color-ink-900: #0b111c;
  --color-ink-850: #101826;
  --color-ink-800: #17202e;
  --color-ink-750: #1d2736;
  --color-fg: #eef1f3;
  --color-fg-soft: #cdd3d9;
  --color-mute: #8c96a3;
  --color-mute-2: #6a727e;
  --color-brass: oklch(0.80 0.09 75);
  --color-brass-2: oklch(0.86 0.09 75);
  --color-brass-d: oklch(0.80 0.09 75 / 0.14);
  --color-sage: oklch(0.80 0.06 160);
  --color-line: rgba(255,255,255,0.07);
  --color-line-2: rgba(255,255,255,0.12);
  --font-serif: "Newsreader", Georgia, serif;
  --font-sans: "Geist", ui-sans-serif, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
  --radius: 22px;
  --max-w: 1240px;
}
```

`styles/tokens.css` — identische Custom Properties als Fallback für Nicht-Tailwind-Klassen (copy aus Svelte `global.css`).

**Akzeptanzkriterium:**
- `npm run dev` startet ohne Fehler
- `http://localhost:5173` zeigt leere Seite mit `#0b111c` Background
- `npm run build` erzeugt `dist/` ohne Fehler

---

## Aufgabe 2: Design-Assets generieren (Claude-Prompts)

- [x] **M1:** favicon.svg, hero-halo.svg und 6 Icon-SVGs (fuehrung/digitalisierung/team/strategie/kommunikation/resilienz) — stroke-only, 24×24 viewBox, als `?react`-Komponenten via `vite-plugin-svgr` registriert.

**Ziel:** SVG-Assets für Hero-Halo, Icons, Favicon via Claude generieren.
Fertige Prompts stehen in `design-system.md` (Abschnitt „Was du Claude für Assets fragen kannst").

**Assets:**

| Datei | Claude-Prompt in `design-system.md` |
|-------|--------------------------------------|
| `assets/hero-halo.svg` | Abschnitt „1. SVG Hero-Halo" |
| `assets/icons/icon-*.svg` | Abschnitt „2. SVG Icons" |
| `assets/favicon.svg` | Abschnitt „4. Favicon (SVG)" |

**Akzeptanzkriterium:**
- Alle SVGs valide (kein `viewBox`-Fehler im Browser)
- `hero-halo.svg` rendert mit sichtbarem Brass-Glow auf `#0b111c`
- Icons skalieren sauber auf 16–64px

---

## Aufgabe 3: KickerBar-Komponente

- [x] **M2:** KickerBar.tsx mit Brass-Linie, Sage-Dots, Mono-Text — Parts-Array Support.

**Ziel:** Extrahierte Kicker-Leiste (Brass-Bar + Sage-Dot + Mono-Text) als wiederverwendbare
React-Komponente.

**Dateien:**
- `src/components/KickerBar.tsx` — neu

**Implementierung:**

```tsx
interface KickerBarProps {
  parts: string[];  // z.B. ["Digital Coach", "Führungskräfte-Mentor"]
}

export function KickerBar({ parts }: KickerBarProps) {
  return (
    <div className="flex items-center gap-[14px] font-mono text-[11px] tracking-[0.14em] uppercase text-mute">
      <span className="w-[44px] h-px bg-brass opacity-70 flex-shrink-0" aria-hidden />
      {parts.map((part, i) => (
        <>
          {i > 0 && <span className="w-[5px] h-[5px] rounded-full bg-sage flex-shrink-0" aria-hidden />}
          <span key={part}>{part}</span>
        </>
      ))}
    </div>
  );
}
```

**Akzeptanzkriterium:**
- Brass-Linie und Sage-Dots sichtbar
- `parts={["A", "B", "C"]}` → 2 Dots zwischen 3 Segmenten

---

## Aufgabe 4: Hero-Komponente

- [x] **M2:** Hero.tsx + Portrait.tsx — H1 mit `em`-Italic in Brass-2, Kicker-Reveal + H1-Reveal via Framer Motion, CTA-Buttons, hero-halo.svg Background + CSS radial-gradient. Responsive (≤960px 1-spaltig).

**Ziel:** Port von `Hero.svelte` — pixel-perfect nach aktuellem Design.

**Dateien:**
- `src/components/Hero.tsx` — neu
- `src/components/Portrait.tsx` — neu (Monogramm-Placeholder)

**Implementierung:**

```tsx
interface HeroProps {
  title?: string;
  titleEmphasis?: string;
  subtitle?: string;
  tagline?: string;
  avatarInitials?: string;
  personName?: string;
  personRole?: string;
}
```

Halo-Hintergrund via `hero-halo.svg` als absolut positioniertes `<img>` (pointer-events: none).
Framer Motion `initial/animate` für Kicker-Bar-Reveal (opacity 0→1, y: 8→0, delay: 0.1s)
und H1-Reveal (opacity 0→1, y: 16→0, delay: 0.25s).

`Portrait.tsx` — Monogramm-Kreis mit `#17202e` Background, Brass-Border,
Newsreader Italic für Initiale (entspricht aktuellem Svelte-`Portrait.svelte`).

**Akzeptanzkriterium:**
- H1: Newsreader 300, `clamp(44px, 6.2vw, 88px)`, `em`-Tag italic in `--brass-2`
- CTA-Buttons: Pill-Radius, Primary mit Brass-Background, Ghost mit Brass-Hover
- Auf ≤960px: einspaltig, Portrait zentriert

---

## Aufgabe 5: ServiceCard + ServiceRow

- [x] **M2:** ServiceCard.tsx (Brass-Top-Border, Hover-Lift via Framer Motion) + ServiceRow.tsx (3-Spalten-Grid Desktop / 1-Spaltig Mobile) + IconRegistry (6 Stroke-Icons).

**Ziel:** 3 Coaching-Service-Karten mit Brass-Top-Border und Hover-Lift.

**Dateien:**
- `src/components/ServiceCard.tsx` — neu
- `src/components/ServiceRow.tsx` — neu

**Implementierung:**

`ServiceCard`:
```tsx
interface ServiceCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
}
```
Styling: `bg-ink-850 border border-line-2 border-t-2 border-t-brass rounded-[22px]`,
Hover: `translateY(-4px)` via Framer Motion `whileHover`.

`ServiceRow`: 3-Spalten-Grid (Desktop), 1-Spaltig (Mobile ≤768px),
Icons aus `assets/icons/` als React-Komponenten (`<IconFuehrung />`).

**Akzeptanzkriterium:**
- Brass-Top-Border sichtbar
- Hover-Lift animiert
- Responsive

---

## Aufgabe 6: WhyMeStats

- [x] **M3:** WhyMeStats.tsx mit CountUp-Hook + `useInView` (once: true), Newsreader 44px, em-Tags in Brass.

**Ziel:** Stat-Zähler-Sektion (z.B. „30+ Jahre Erfahrung") mit AnimatedCounter beim Scroll-Enter.

**Dateien:**
- `src/components/WhyMeStats.tsx` — neu

**Implementierung:**

Custom Hook `useCountUp(target, duration)` mit `IntersectionObserver` (einmal feuern wenn
Element im Viewport). Zahlen in Newsreader 44px, `em`-Tags in `--brass`. Layout: 3–4 Stats
horizontal, Divider via `border-line`.

**Akzeptanzkriterium:**
- Zahlen laufen hoch wenn Section ins Viewport scrollt
- Zähler feuert nur einmal pro Mount

---

## Aufgabe 7: FAQ-Accordion

- [x] **M3:** FAQ.tsx mit `AnimatePresence` + `motion.div` Height-Transition, Keyboard-zugänglich (Enter/Space), mehrere gleichzeitig offen, Brass-Chevron.

**Ziel:** Akkordeon-FAQ mit Framer Motion Höhen-Animation.

**Dateien:**
- `src/components/FAQ.tsx` — neu

**Implementierung:**

Kein externer Accordion-Primitive — `AnimatePresence` + `motion.div` mit `initial/exit`
Höhen-Transition. Border: `border-line`, offene Frage: Brass-Farbe im Titel.
Tastatur-zugänglich: `role="button"`, `aria-expanded`, `Enter`/`Space` öffnen.

**Akzeptanzkriterium:**
- Öffnen/Schließen animiert (kein Layout-Sprung)
- Mehrere gleichzeitig offen möglich
- Keyboard-navigierbar

---

## Aufgabe 8: Kontaktformular

- [x] **M3:** ContactForm.tsx mit react-hook-form + zodResolver + Zod-Schema, Formspree-POST mit Mailto-Fallback wenn `VITE_FORMSPREE_ENDPOINT` fehlt. Inline-Validierungsfehler, Success/Error-States, DSGVO-Consent-Checkbox.

**Ziel:** Validiertes Kontaktformular mit Formspree-Backend.

**Dateien:**
- `src/components/ContactForm.tsx` — neu
- `.env.example` — `VITE_FORMSPREE_ENDPOINT=https://formspree.io/f/<id>`

**Implementierung:**

```tsx
const schema = z.object({
  name:    z.string().min(2, "Name erforderlich"),
  email:   z.string().email("Gültige E-Mail erforderlich"),
  message: z.string().min(10, "Nachricht zu kurz"),
});
```

`useForm` mit `zodResolver`, `onSubmit` → `fetch(VITE_FORMSPREE_ENDPOINT, {method: "POST", body: JSON})`.
Success-State: Brass-Checkmark + „Danke, ich melde mich bald!"-Meldung.
Error-State: Roter Fehlerhinweis pro Feld (inline, kein Alert).

**Akzeptanzkriterium:**
- Leeres Submit → Inline-Validierungsfehler sichtbar
- Erfolgreicher Submit → Success-State ohne Reload
- `VITE_FORMSPREE_ENDPOINT` nicht gesetzt → Dev-Warning, kein Absturz

---

## Aufgabe 9: Footer + Navigation

- [x] **M4:** Footer.tsx (Brand-Spalte, Kontakt, Angebote, Rechtliches) + Navigation.tsx (sticky, backdrop-blur, mobile Sheet, NavLink-Active-State in Brass).

**Ziel:** Minimaler Footer (Copyright, Links) und Desktop-Topnav.

**Dateien:**
- `src/components/Footer.tsx` — neu
- `src/components/Navigation.tsx` — neu

**Implementierung:**

Footer: Logo-Typo + Brass-Unterstrich, 3 Spalten (Links, Rechtliches, Kontakt), Hintergrund `ink-850`.
Navigation: Sticky Top, `backdrop-blur`, aktiver Link in Brass-Farbe via `useMatch`.

**Akzeptanzkriterium:**
- Footer responsive (1-spaltig ≤768px)
- Nav-Links reagieren auf aktive Route

---

## Aufgabe 10: Routing + Pages + OG-Meta

- [x] **M4:** App.tsx mit React Router v7 (`<Routes>` für `/`, `/kontakt`, `/impressum`, `/datenschutz`, 404), PageMeta.tsx für dynamische Title/Description/OG/Canonical, alle 4 Pages verdrahtet, ScrollToTop bei Route-Wechsel.

**Ziel:** SPA-Routing mit React Router v7, alle 4 Seiten verdrahtet, OG-Tags via `react-helmet`.

**Dateien:**
- `src/App.tsx` — Routen-Definition
- `src/pages/*.tsx` — Seiten-Wrapper

**Implementierung:**

```tsx
<Routes>
  <Route path="/" element={<HomePage />} />
  <Route path="/kontakt" element={<KontaktPage />} />
  <Route path="/impressum" element={<ImpressumPage />} />
  <Route path="/datenschutz" element={<DatenschutzPage />} />
</Routes>
```

`vite.config.ts`: `base: "/"`, alle Routes → `index.html` (SPA-Fallback via Hosting-Config).
OG-Image: statisches Fallback-Bild aus `assets/og-default.png` (1200×630, via Claude-Prompt
in `design-system.md` Abschnitt „3. OG-Image Template").

**Akzeptanzkriterium:**
- Direktaufruf `/kontakt` landet auf Kontakt-Seite (kein 404)
- `<meta og:image>` gesetzt auf allen Seiten

---

## Aufgabe 11: Verifikation

- [x] **M5:** `pnpm tsc --noEmit` 0 Errors · `pnpm run build` erzeugt `dist/` · `task workspace:validate`, `task test:changed`, `task freshness:regenerate`, `task freshness:check` grün.

**Implementierung:**

```bash
# 0. Failing-test-Schritt: TypeScript soll ohne Hero.tsx scheitern
# Vor Aufgabe 4 verifizieren: tsc --noEmit mit fehlendem Hero schlägt fehl.
# To verify it fails: remove Hero import from HomePage.tsx → tsc → expect FAIL (TS2307)
# Nach Aufgabe 4: tsc --noEmit → expect PASS (0 errors)

# 1. TypeScript
cd mentolder-web && npx tsc --noEmit

# 2. CI-Gate (Monorepo-Offline-Tests, Manifeste, Freshness)
task test:changed
task freshness:regenerate
task freshness:check

# 3. Build
npm run build
# → dist/ ohne Fehler

# 4. Preview
npm run preview
# → alle 4 Routen erreichbar, kein Konsolenfehler

# 5. Lighthouse
npx lighthouse http://localhost:4173 --only-categories=performance,accessibility,best-practices
# Ziel: Performance > 90, Accessibility > 95

# 6. Responsivität (manuell in Chrome DevTools)
# 375px (iPhone), 768px (Tablet), 1280px (Desktop)
```

**Akzeptanzkriterium:**
- Failing-test-Schritt: `tsc` mit fehlendem Hero-Import schlägt fehl (TS2307) — dann nach Aufgabe 4 grün
- `tsc --noEmit` grün (0 Errors)
- `task test:changed` grün
- `task freshness:regenerate` + `task freshness:check` grün
- `npm run build` grün
- Lighthouse Performance > 90, Accessibility > 95
- Alle 3 Breakpoints visuell korrekt

---

## Implementierungsreihenfolge

1. Aufgabe 1 — Setup (Blocker für alle)
2. Aufgabe 2 — Assets (parallel zu 3–9 ausführbar)
3. Aufgaben 3–5 — Kern-Komponenten (KickerBar → Hero → ServiceRow)
4. Aufgaben 6–9 — Restliche Komponenten (parallel)
5. Aufgabe 10 — Routing + Pages (nach 3–9)
6. Aufgabe 11 — Verifikation (abschließend)
