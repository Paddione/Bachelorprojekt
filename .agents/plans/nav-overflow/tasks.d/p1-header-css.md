# p1-header-css — Breakpoint erweitern

## Ziel

Der bestehende `@media (max-width: 860px)`-Block in Navigation.svelte bekommt
drei zusätzliche Regeln, sodass die Header-Zeile auf schmalen Viewports passt
und nichts horizontal überläuft.

## Budgets

- `components/website/src/components/Navigation.svelte`: Ist 511 Zeilen,
  nicht-baselined, wirksame Schwelle ist das statische Limit — der Fix fügt
  rund ein Dutzend CSS-Zeilen hinzu. Budget ausreichend.
- `tests/spec/navigation-responsive.bats`: neue Datei, klein. Budget
  ausreichend.

Keine Baseline-Einträge hinzufügen. Keine neuen Import-Zyklen (reine
CSS-Änderung in Scoped Styles). Keine neuen `any`-Typen. Keine Änderung der
Bildsprache (nur Eindämmung, keine neuen Farben, Radien oder Effekte).

<!-- vitest: kein neuer Test nötig, weil reine CSS-Änderung ohne Logikänderung -->

## Steps

1. In `components/website/src/components/Navigation.svelte` den
   `@media (max-width: 860px)`-Block (derzeit `.nav-links`, `.nav-meta`,
   `.nav-link-sm`, `.user-pill-wrap`, `.mobile-toggle`, `.wrap`) um genau
   diese Regeln ergänzen:
   - `.nav-cta { display: none; }` — die Pill passt nicht neben Marke und
     Toggle; Kontakt bleibt über das Mobil-Menü (NavMobile) erreichbar.
   - `.brand { flex-shrink: 1; min-width: 0; }` — Brand darf schrumpfen.
   - `.brand-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`
     — langer Markenname kürzt mit Ellipse statt zu überlaufen.
   - Keine sonstige Zeile der Datei anfassen, keinen neuen Breakpoint
     einführen.
2. Guards grün laufen lassen (im Worktree):
   `tests/unit/lib/bats-core/bin/bats tests/spec/navigation-responsive.bats`
   Beide Cases müssen grün sein.
3. Verhaltensprobe (manuell, einmalig): Massage-Dev-Instanz starten
   (`BRAND=massage BRAND_NAME=massage POCKET_ID_WEBSITE_SECRET=dummy` ab
   `components/website/`, Port 4321) und per Playwright prüfen:
   Pixel-7-Gerät, `innerWidth <= visualViewport`, kein Element breiter als
   412px, Tap auf `.mobile-toggle` öffnet das Menü (`aria-expanded=true`).
   Erst bei bestandener Probe ist p1 fertig.
