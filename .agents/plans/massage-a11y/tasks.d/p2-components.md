# p2-components — Komponenten umstellen und Guards setzen

## Ziel

Brass-Text liest das on-brass-Token, Footer-Heading nutzt Text-Brass, und
mailto rendert nur bei nicht-leerer Adresse — jeweils im Muster des
danebenliegenden Telefon-Guards.

## Budgets

- `components/website/src/components/Navigation.svelte`: Ist klein,
  nicht-baselined — eine Farb-Zeile ändern. Budget ausreichend.
- `components/website/src/components/CallToAction.svelte`: Ist klein,
  nicht-baselined — eine Farb-Zeile ändern. Budget ausreichend.
- `components/website/src/components/Footer.astro`: Ist klein,
  nicht-baselined — Guard plus eine Farb-Zeile. Budget ausreichend.
- `components/website/src/components/ContactHub.svelte`: Ist klein,
  nicht-baselined — Guard setzen. Budget ausreichend.

Keine Baseline-Einträge hinzufügen. Keine neuen `any`-Typen.

<!-- vitest: kein neuer Test nötig, weil Farb-Token-Referenzen und Render-Guards ohne Logikänderung -->

## Steps

1. `Navigation.svelte`: in `.nav-cta` die Textfarbe von `var(--ink-900)` auf
   `var(--on-brass)` umstellen. `.mark-m`-Farbe prüfen: falls ebenfalls
   ink-900-auf-Brass, gleich mit umstellen.
2. `CallToAction.svelte`: in `.btn-primary` die Textfarbe von
   `var(--ink-900)` auf `var(--on-brass)` umstellen.
3. `Footer.astro`: mailto-Link mit `{footerEmail && (...)}` sichern (Muster
   des Telefon-Links direkt darüber); bei leerer Adresse rendert nichts.
   `.footer-heading`-Farbe von `var(--brass)` auf `var(--brass-2)` umstellen
   (brass-2 ist als Text-Brass dokumentiert).
4. `ContactHub.svelte`: mailto-Link mit `{#if email}` sichern (Muster des
   Telefon-Links direkt darüber); bei leerer Adresse rendert nichts.
5. Guard-Grün prüfen (im Worktree):
   `tests/unit/lib/bats-core/bin/bats tests/spec/massage-a11y.bats`
   Alle 5 Cases müssen grün sein.
