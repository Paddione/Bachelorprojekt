# p1-tokens — Brand-Tokens setzen

## Ziel

Beide Brand-Stylesheets bekommen das semantische `--on-brass`-Token
(dunkle Schrift auf Brass); Massage schließt zusätzlich den
`--color-fg`-Leak und dunkelt Mute-Text auf WCAG AA ab.

## Budgets

- `components/website/public/brand/massage/colors_and_type.css`: Ist klein,
  nicht-baselined — wenige Token-Zeilen dazu. Budget ausreichend.
- `components/website/public/brand/mentolder/colors_and_type.css`: Ist klein,
  nicht-baselined — genau eine additive Token-Zeile. Budget ausreichend.

Keine Baseline-Einträge hinzufügen. Keine neuen Import-Zyklen (reine CSS).
Keine neuen `any`-Typen. Hues behalten, nur Abdunklung.

<!-- vitest: kein neuer Test nötig, weil reine Token-Werte ohne Logikänderung -->

## Steps

1. In `components/website/public/brand/massage/colors_and_type.css`:
   - `--on-brass` auf den dunklen Ink-Wert des Themes setzen (Ziel: 4.5 auf
     Brass #B98A3E — mit AxeBuilder verifizieren, nicht raten).
   - `--color-fg` auf dunkle Primärschrift setzen (schließt den Leak aus
     global.css `.t-h3-serif` u.a.).
   - `--mute` (ggf. `--mute-2`, `--paper-mute`, `--color-mute`) so abdunkeln,
     dass kleiner Text auf Paper 4.5 erreicht — Hue-Familie behalten.
   - `--color-*`-Leak-Audit: alle `var(--color-…)`-Verwendungen in
     `src/styles/global.css` auflisten und prüfen, ob Massage jeden davon
     definiert; fehlende mit dunklen Werten ergänzen.
2. In `components/website/public/brand/mentolder/colors_and_type.css`:
   - Genau eine Zeile ergänzen: `--on-brass` mit dem bisherigen
     CTA-Text-Wert (render-identisch, keine sichtbare Änderung).
   - Keine einzige bestehende Zeile ändern.
3. Guard-Grün für p1 prüfen (im Worktree):
   `tests/unit/lib/bats-core/bin/bats tests/spec/massage-a11y.bats -f T901312-1`
   muss grün sein (andere Cases dürfen noch rot sein).
