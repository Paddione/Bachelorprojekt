# Proposal: Mentolder Homepage — hifi-Redesign in Astro+Svelte

_Ticket: T001034_

## Why

Die aktuelle mentolder.de Homepage erfüllt funktional ihren Zweck, aber die visuelle Qualität
bleibt hinter dem angestrebten Design-Niveau zurück. Die Komponenten (Hero, ServiceRow, WhyMe,
FAQ, Process, CallToAction) wurden organisch gewachsen und zeigen Inconsistenzen in Spacing,
Typografie-Hierarchie und Animationsverhalten.

Ein High-Fidelity-Redesign **innerhalb** des bestehenden Astro+Svelte-Stacks bringt:
- Konsistentes Visuelles System (Design-Tokens als Single Source of Truth)
- Professionelle Micro-Animationen (Scroll-Reveals, Hover-States)
- Bessere Conversion-Optimierung durch klare visuelle Hierarchie
- Messbar verbesserte Lighthouse-Scores (LCP/CLS)

Der bestehende Tech-Stack (Astro + Svelte 5, Kustomize, Fleet-Cluster) bleibt unverändert —
kein Neubau, nur visuelle Exzellenz auf existierender Infrastruktur.

## What

### Design-System-Tokens (Basis für alle Redesign-Entscheidungen)

| Token | Wert |
|-------|------|
| `--ink-900` | `#0b111c` (Haupt-Background) |
| `--ink-850` | `#101826` |
| `--ink-800` | `#17202e` |
| `--brass` | `oklch(0.80 0.09 75)` (Primärakzent) |
| `--brass-2` | `oklch(0.86 0.09 75)` (hover) |
| `--brass-d` | `oklch(0.80 0.09 75 / 0.14)` (subtiler Tint) |
| `--sage` | `oklch(0.80 0.06 160)` (sekundärer Akzent) |
| `--fg` | `#eef1f3` |
| `--fg-soft` | `#cdd3d9` |
| `--mute` | `#8c96a3` |
| `--font-serif` | Newsreader (Headlines) |
| `--font-sans` | Geist (Body/UI) |

### Abschnitte mit konkreten Upgrades

| Komponente | Aktuell | Redesign-Ziel |
|---|---|---|
| **Hero.svelte** (266 Z.) | Halo-Blur + H1 + Portrait | Größere Typografie-Hierarchie, Entrance-Animation, stärkerer Kontrast-Kicker |
| **ServiceRow.svelte** (280 Z.) | 3 Service-Cards flat | Glassmorphism-Cards mit Brass-Border-Top, Feature-List verbessert |
| **WhyMe.svelte** (178 Z.) | Liste + QuoteCard nebeneinander | Nummerierte Points mit Brass-Akzent-Connector, QuoteCard redesigned |
| **FAQ.svelte** (163 Z.) | Accordion | Smooth-Height-Transition, bessere Chevron-Animation |
| **Process.astro** (189 Z.) | Schritte-Liste | Horizontale Connector-Linie auf Desktop, Nummerierung mit Brass |
| **CallToAction.svelte** (182 Z.) | CTA-Banner | Volle Breite, Gradient-Overlay, prominentere Button-Styles |
| **StatsStrip.astro** (136 Z.) | 3 Stat-Cards | Brass-Akzent-Zahlen, bessere Responsive-Darstellung |

### CSS Custom Properties — Zentralisierung

Aktuell sind viele Tokens inline in `<style>`-Blöcken der Svelte-Dateien. Ziel:
`website/src/styles/tokens.css` als SSOT für alle Design-Token-Variablen (bereits importiert
im Layout — nur Zentralisierung nötig, kein Neubau).

### Animations-Framework

`@keyframes` + CSS `animation` (kein JS-Framework) für:
- Scroll-Reveal via `IntersectionObserver` (Svelte `onMount`)
- Hero-Halo entrance (opacity + scale, 0.6s ease-out)
- FAQ accordion smooth-height (CSS `grid-template-rows: 0fr → 1fr`)

### GIVEN / WHEN / THEN

**GIVEN** ich öffne `mentolder.de` im Desktop-Browser  
**WHEN** die Seite lädt  
**THEN** sehe ich einen Hero mit großer Newsreader-H1 (≥5rem), starkem Brass-Kicker und
einlaufender Halo-Animation — visuell deutlich polierter als vorher

**GIVEN** ich scrolle zur ServiceRow  
**WHEN** die Cards in den Viewport kommen  
**THEN** fahren die Cards mit Staggered-Fade-In ein (3×100ms Delay)

**GIVEN** ich nutze ein Smartphone (375px)  
**WHEN** ich die Seite lade  
**THEN** sind alle Sections korrekt gestapelt, keine Overflow-Issues, CTAs vollflächig

**GIVEN** ich messe mit Lighthouse  
**WHEN** der Audit läuft  
**THEN** ist LCP ≤2.5s, CLS <0.1 — keine Regression gegenüber vorher

### Out of Scope

- Inhalts-Änderungen (Texte, Preise, Services) — nur Layout/Visuell
- Neue Seiten oder Routen
- Backend-Änderungen
- Korczewski/Kore Brand (bleibt unberührt)
- T001026 React-Rebuild (paralleles Ticket, separater Scope)
