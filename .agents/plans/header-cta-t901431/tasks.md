---
title: "header-cta-t901431 — Massage Header-CTA und Kontakt-Tab"
ticket_id: T901431
domains: [website, massage]
status: active
---

# header-cta-t901431 — Implementation Plan

## File Structure

- `components/website/src/components/Navigation.svelte`: optionaler `ctaLabel`-Prop, CTA rendert Override oder Shared-Fallback.
- `components/website/src/layouts/Layout.astro`: reicht `config.navigationCta` als `ctaLabel` an die Navigation durch.
- `components/website/src/config/types.ts`: neues optionales BrandConfig-Feld `navigationCta`.
- `components/website/src/config/brands/massage.ts`: setzt `navigationCta` auf den Massage-Wortlaut.
- `components/website/src/components/ContactHub.svelte`: Nachrichten-Tab und Paneltitel werden journey-gesteuert.
- `components/website/src/components/Navigation.test.ts`: Vitest-Fälle für Override und Fallback.
- `tests/spec/massage-header-cta.bats`: neue Datei mit den Guards T901431-1 bis T901431-4.
- `components/website/src/data/test-inventory.json`: generiert, Inventar für die neuen Test-IDs.

## Budgets

Alle sechs bestehenden Dateien sind nicht-baselined, wirksam ist das statische
Extension-Limit aus `docs/code-quality/gates.yaml`. Budgets exakt nach
`scripts/plan-lint.sh residual_budget` (Limit minus Ist-Zeilen):

| `components/website/src/components/Navigation.svelte` | 523 | 577 |
| `components/website/src/layouts/Layout.astro` | 113 | 887 |
| `components/website/src/config/types.ts` | 188 | 712 |
| `components/website/src/config/brands/massage.ts` | 208 | 692 |
| `components/website/src/components/ContactHub.svelte` | 625 | 475 |
| `components/website/src/components/Navigation.test.ts` | 74 | 826 |

Die neue BATS-Datei startet mit frischem Limit, das Inventar ist generiert.
Keine Datei liegt über achtzig Prozent ihrer wirksamen Schwelle, daher ist
kein Split nötig. Es wird keine Baseline-Ausnahme eingeplant.

## Zweck

OQ-10 hat zwei Ziele. Erstens zeigt die Massage-Brand im Header den
massage-spezifischen CTA-Wortlaut statt des geteilten Strings
`nav.cta-label` (`Erstgespräch`), ohne die anderen Brands zu verändern.
Zweitens heißt der Kontakt-Tab für die Massage-Brand `Schriftliche
Rückfrage stellen` statt `Eine Frage stellen`. Der Header behält genau
einen CTA-Button (T901310-Form bleibt unangetastet), die Kontakt-Tabs
behalten Test-ID und Aria-Beschriftung, sodass die bestehenden
End-to-End-Prüfungen weiterlaufen.

## Scope and evidence

Work only in `.worktrees/header-cta-T901431` on `feature/header-cta-T901431`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.

Recon-Befund: `Navigation.svelte` rendert den CTA in Zeile 172 bis 173 via
`t(locale, 'nav.cta-label')`, die i18n-Schicht (`i18n/index.ts`) kennt keinen
Brand-Override. Der etablierte Brand-Mechanismus ist `config/index.ts` (Wahl
per `BRAND`-Umgebung) plus Props (`siteTitle` an Navigation,
`journeyEnabled` an ContactHub aus `kontakt.astro`, dort nur für die
Massage-Brand gesetzt). Der Plan folgt diesem Muster: optionales
BrandConfig-Feld plus optionaler Prop mit Shared-Fallback. Die
mentolder- und korczewski-Konfigurationen bleiben unberührt, daher bleibt
deren `Erstgespräch`-CTA bestehen und der T5-Fall der
korczewski-Prüfung bleibt grün. Der Mobil-CTA (`NavMobile`,
`hero.cta-primary`) ist bewusst außerhalb des Scopes.

Der Nachrichten-Tab trägt `data-testid tab-nachricht`; FA-10 T5 und T6
sowie der korczewski-Kontaktfall selektieren über diese Test-ID, nicht
über den sichtbaren Wortlaut. Der Plan ändert nur den sichtbaren
Titel und die Panel-Überschrift, sobald `journeyEnabled` gesetzt ist.
Die FA-62- bis FA-65-Prüfungen brauchen keine Anpassung: der Header-CTA
behält Ziel `/kontakt` und Einzel-Button-Form.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-header-cta.md | impl | `components/website/src/components/Navigation.svelte`, `components/website/src/layouts/Layout.astro`, `components/website/src/config/types.ts`, `components/website/src/config/brands/massage.ts` |  |
| p2 | tasks.d/p2-kontakt-tab.md | impl | `components/website/src/components/ContactHub.svelte` |  |
| p3 | tasks.d/p3-tests.md | tests | `tests/spec/massage-header-cta.bats`, `components/website/src/components/Navigation.test.ts`, `components/website/src/data/test-inventory.json` | p1, p2 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst** (`tasks.d/p3-tests.md`
  Schritt 1): Guards und Vitest-Fälle gegen den ungefixten Stand laufen
  lassen, Rot beobachten (`expected: FAIL`). Erst danach beginnen p1 und p2.
- [ ] **1. Partial p1 ausführen** (`tasks.d/p1-header-cta.md`): Header-CTA
  mit Brand-Override und Shared-Fallback. Verify pro Partial-Plan.
- [ ] **2. Partial p2 ausführen** (`tasks.d/p2-kontakt-tab.md`):
  Kontakt-Tab journey-gesteuert umbenennen. Verify pro Partial-Plan.
- [ ] **3. Partial p3 ausführen** (`tasks.d/p3-tests.md`): Grün-Phase,
  Inventar regenerieren und mitcommitten. Verify pro Partial-Plan.
- [ ] **4. Abschluss-Verifikation.** Im Worktree ausführen:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Alle drei müssen grün sein.
