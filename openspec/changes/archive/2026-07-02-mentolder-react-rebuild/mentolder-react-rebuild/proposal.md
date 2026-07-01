# Proposal: mentolder.de Website-Frontend in React neu aufbauen

_Ticket: T001026_

## Why

Die öffentliche mentolder.de Website ist als Svelte-Komponenten tief in den Astro-Monolithen des
Bachelorprojekts eingebettet. Jede Content-Änderung erfordert ein Full-Stack-Kubernetes-Deployment.
Für eine Coaching-Website, die regelmäßig Texte, Bilder und CTA-Texte anpassen muss, ist das ein
zu schwerer Deployment-Pfad.

Ein eigenständiges React-Paket (Vite + React 19 + TypeScript) lässt sich:
- unabhängig vom K8s-Cluster deployen (CDN/Vercel/Netlify),
- von externen Kollaborateuren wartungsfrei übergeben (React ist breiter bekannt als Svelte),
- direkt in Vercel Preview-Deployments pro Branch testen, ohne Cluster-Zugriff.

Das bestehende Design-System (Dark-Mode, Brass-Akzent `oklch(0.80 0.09 75)`, Newsreader/Geist
Typografie) bleibt 1:1 erhalten — migriert als CSS Custom Properties + Tailwind v4 Theme.

## What

### Öffentliche Seiten (Phase 1 — MVP)

| Route | Inhalt |
|-------|--------|
| `/` | Hero, ServiceRow (3 Karten), WhyMe-Stats, FAQ (Accordion), CTA-Banner, Footer |
| `/kontakt` | Kontaktformular (react-hook-form + zod, Formspree-Backend) |
| `/impressum` | Statische Rechtseite |
| `/datenschutz` | Statische Rechtseite |

### Technologie-Stack

| Schicht | Wahl | Begründung |
|---------|------|------------|
| Build | Vite 6 + React 19 | schnelles DX, kein SSR-Overhead für diese Content-Seite |
| Language | TypeScript strict | Projekt-Standard |
| Styling | Tailwind v4 + CSS Custom Props | Design-Tokens portierbar, kein Inline-Style-Chaos |
| Routing | React Router v7 | leichtgewichtig, SPA-Routing reicht |
| Animationen | Framer Motion | Scroll-Reveals, Hero-Halo-Entrance (entspricht aktuellem Svelte-Verhalten) |
| Formulare | react-hook-form + zod | Validierung + Typsicherheit |
| Icons | eigene SVG-Komponenten | keine Icon-Lib-Dependency, Stroke-Only-Style passt zum Design |

### Design-System-Tokens (aus aktuellem Svelte-Code extrahiert)

Vollständige Token-Tabelle und Tailwind-v4-Config: `design-system.md` in diesem Change.

### GIVEN / WHEN / THEN

**GIVEN** ich öffne `mentolder.de` im Browser  
**WHEN** die Seite geladen ist  
**THEN** sehe ich Hero, ServiceRow, WhyMe-Stats, FAQ und Footer — visuell identisch zur
aktuellen Svelte-Implementierung (Dark-Background `#0b111c`, Brass-Akzent-CTAs, Newsreader-H1)

**GIVEN** ich klicke auf „Kostenloses Erstgespräch"  
**WHEN** die `/kontakt`-Route lädt  
**THEN** sehe ich ein validiertes Kontaktformular; bei Submit wird eine Formspree-Anfrage
gesendet, und ich erhalte eine Success-Meldung (kein Full-Page-Reload)

**GIVEN** `VOYAGE_API_KEY` / K8s-Cluster sind nicht erreichbar  
**WHEN** die React-App deployed wird  
**THEN** ist das Deployment unabhängig davon erfolgreich — keine Cluster-Dependency für die
statische Frontend-Auslieferung

**GIVEN** ich führe `npm run build` aus  
**WHEN** der Build abgeschlossen ist  
**THEN** liegt ein vollständig statisches `dist/`-Verzeichnis vor, deploybar auf Vercel, Netlify
oder einem beliebigen CDN ohne Serverkomponente

## Neue Artefakte

```
mentolder-web/                    ← neues Paket (separates Repo oder Monorepo-Pkg)
  src/
    components/
      Hero.tsx                    ← port von Hero.svelte
      ServiceCard.tsx
      ServiceRow.tsx
      WhyMeStats.tsx
      FAQ.tsx
      ContactForm.tsx
      Footer.tsx
      Portrait.tsx
      KickerBar.tsx               ← extrahierte Kicker-Leiste mit Brass-Bar + Sage-Dot
    pages/
      HomePage.tsx
      KontaktPage.tsx
      ImpressumPage.tsx
      DatenschutzPage.tsx
    assets/
      hero-halo.svg               ← SVG-Hintergrundgrafik (Claude-generiert)
      icons/                      ← 6 Coaching-Icons (Claude-generiert)
      favicon.svg
    styles/
      tokens.css                  ← Design-Tokens als CSS Custom Properties
      global.css
    App.tsx
    main.tsx
  tailwind.config.css             ← @theme mit mentolder-Tokens
  vite.config.ts
  tsconfig.json
  package.json
```

## Abgrenzung (nicht in Scope)

- Kein Blog / kein CMS in Phase 1
- Kein Keycloak-Login auf der öffentlichen Website (nur `/portal`-Bereich, bleibt im Monolithen)
- Keine Nextcloud-/Chat-Integration
- Kein Next.js (SSG via Vite `rollupOptions.input` reicht für 4 statische Routen)
