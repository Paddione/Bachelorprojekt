---
title: "business-homepage — Massage-Homepage und Leistungsseiten"
ticket_id: T901028
domains: [website, brand, content]
status: active
---

# business-homepage — Implementation Plan

## File Structure

- `components/website/src/config/types.ts`: Brand-Union um massage erweitern.
- `components/website/src/config/brands/massage.ts`: neu, BrandConfig.
- `components/website/public/brand/massage/colors_and_type.css`: neu, Richtung-A-Tokens.
- `components/website/public/brand/massage/favicon.svg`: neu, Favicon.
- `components/website/content/massage/seo.json`: neu, SEO-Bundle.
- `components/website/content/massage/homepage.json`: neu, Homepage-Bundle.
- `components/website/content/massage/leistungen.json`: neu, Katalog-Bundle.
- `components/website/content/massage/faq.json`: neu, FAQ-Bundle.
- `components/website/content/massage/kontakt.json`: neu, Kontakt-Bundle.
- `components/website/content/massage/navigation.json`: neu, Navigations-Bundle.
- `components/website/content/massage/footer.json`: neu, Footer-Bundle.
- `components/website/content/massage/stammdaten.json`: neu, Stammdaten-Bundle.
- `components/website/content/massage/ueber-mich.json`: neu, Profil-Bundle.
- `components/website/src/pages/index.astro`: Massage-Home-Sections.
- `components/website/src/pages/leistungen.astro`: Massage-Katalogseite.
- `components/website/src/pages/faq.astro`: neu, Massage-FAQ.
- `components/website/src/pages/ueber-mich.astro`: Massage-Profil.
- `components/website/src/pages/404.astro`: brand-conditional Fehlerseite.
- `components/website/src/pages/impressum.astro`: Massage-Impressum.
- `components/website/src/pages/datenschutz.astro`: Massage-Datenschutz.
- `tests/spec/business-homepage.bats`: neu, Spec-Guards.
- `components/website/src/lib/__tests__/massage-brand.test.ts`: neu, Vitest.

## Zweck

Öffentliche Massage-Homepage im Astro-Stack: Brand-Fundament Richtung A
„Ruhige Wärme“, Homepage mit Hero, Leistungen, Vertrauen, Ablauf und CTA in
die Anfrage-Journey, Katalogseite, FAQ, Profil, Pflichtseiten und Fehlerseite.
Alle Inhalte aus T901021-Entwürfen, fehlende Owner-Inputs als markierte
Platzhalter-Slots. Nur der Ort ist öffentlich, keine Heilkunde-Claims.

## Scope and evidence

Work only in `.worktrees/business-homepage` on `feature/business-homepage-T901028`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.
Grilling g1-g5 abgenommen (Board Final 2026-10-08): Richtung A, Platzhalter
bauen, nur Ort öffentlich, CTA integriert, Telefon-Fallback ja. Out of scope:
Owner-Inhalte, Portal/Login/Newsletter/Mehrsprachigkeit, Domain/Deployment.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-brand-foundation.md | Brand-Foundation | `components/website/src/config/types.ts`, `components/website/src/config/brands/massage.ts`, `components/website/public/brand/massage/colors_and_type.css`, `components/website/public/brand/massage/favicon.svg`, `components/website/content/massage/seo.json`, `components/website/content/massage/homepage.json`, `components/website/content/massage/leistungen.json`, `components/website/content/massage/faq.json`, `components/website/content/massage/kontakt.json`, `components/website/content/massage/navigation.json`, `components/website/content/massage/footer.json`, `components/website/content/massage/stammdaten.json`, `components/website/content/massage/ueber-mich.json` |  |
| p2 | tasks.d/p2-home-services.md | Home-Services | `components/website/src/pages/index.astro`, `components/website/src/pages/leistungen.astro` | p1 |
| p3 | tasks.d/p3-supporting-pages.md | Supporting-Pages | `components/website/src/pages/faq.astro`, `components/website/src/pages/ueber-mich.astro`, `components/website/src/pages/404.astro`, `components/website/src/pages/impressum.astro`, `components/website/src/pages/datenschutz.astro` | p1 |
| p4 | tasks.d/p4-tests.md | tests | `tests/spec/business-homepage.bats`, `components/website/src/lib/__tests__/massage-brand.test.ts` | p1, p2, p3 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst.** Lege die BATS-Guards aus p4 als
  Skelett an und lasse sie gegen den unimplementierten Stand laufen,
  expected: FAIL. Befehl:
  `tests/unit/lib/bats-core/bin/bats tests/spec/business-homepage.bats`.
  Erst danach beginnt die Implementierung der Partials p1 bis p3.
- [ ] **1. Partial p1 ausführen** (`tasks.d/p1-brand-foundation.md`): Types,
  Config, Tokens, Favicon, neun Content-Bundles. Verify pro Partial-Plan.
- [ ] **2. Partial p2 ausführen** (`tasks.d/p2-home-services.md`): Homepage-
  Sections, Katalogseite. Verify pro Partial-Plan.
- [ ] **3. Partial p3 ausführen** (`tasks.d/p3-supporting-pages.md`): FAQ,
  Profil, Fehlerseite, Pflichtseiten. Verify pro Partial-Plan.
- [ ] **4. Partial p4 ausführen** (`tasks.d/p4-tests.md`): BATS-Guards und Vitest
  vervollständigen, alle grün. Danach `task test:inventory` regenerieren und
  `components/website/src/data/test-inventory.json` mitcommitten.
- [ ] **5. Finaler Verify-Task.** Alle Partials gemergt, keine Baseline-Einträge
  hinzugefügt, keine Brand-Domain-Literale in Code-Snippets. Production-Build
  messen (`astro build` für Brand massage):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
