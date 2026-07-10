---
title: "admin-token-consolidation — Implementation Plan"
ticket_id: T001787
domains: [website, admin, styling]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# admin-token-consolidation — Implementation Plan

_Ticket: T001787 · Epic: T001786 · Design-Spec: `docs/superpowers/specs/2026-07-10-admin-foundation-design.md` §T1_

Consolidate the three-level admin color-token stack into one source. Tailwind
`@theme` in `global.css` becomes the single color-token source; `factory-tokens.css`
is dissolved into `global.css`; `admin-foundation.css` keeps only non-color admin
specifics; `--sidebar-width` gets a single owner in `admin-premium.css`; and the
guard test `admin-token-alias.test.ts` is re-framed to police the new invariant.

## File Structure

| File | Ext | Ist LOC | Effektive S1-Schwelle | Budget | Rolle in dieser PR |
|------|-----|---------|-----------------------|--------|--------------------|
| `website/src/styles/global.css` | `.css` | 306 | ungated (`_ext_limit` = 0 für `.css`) | kein Zeilenbudget | absorbiert die factory-tokens-Inhalte + neue `--admin-*`-Aliase (~+95 Zeilen) |
| `website/src/styles/factory-tokens.css` | `.css` | 143 | ungated | kein Zeilenbudget | GELÖSCHT |
| `website/src/styles/admin-foundation.css` | `.css` | 70 | ungated | kein Zeilenbudget | verliert Farb-Aliase + Sidebar-Tokens (~-25 Zeilen) |
| `website/src/styles/admin-premium.css` | `.css` | 263 | ungated | kein Zeilenbudget | wird Owner von `--sidebar-width` (~+3 Zeilen) |
| `website/src/layouts/AdminLayout.astro` | `.astro` | 265 | 400 (nicht gebaselined) | schrumpft um 1 Zeile | entfernt den redundanten `factory-tokens.css`-Import |
| `website/src/lib/__tests__/admin-token-alias.test.ts` | `.ts` | 25 | 600 (nicht gebaselined) | ~560 Zeilen frei | Guard-Test neu gefasst (~40 Zeilen) |

Verifizierte Fakten für dieses Plan-Set:
- Alle vier `.css`-Dateien und die Test-Datei sind **nicht gebaselined** → wirksame Schwelle = statisches Extension-Limit. `.css` ist im S1-Ratchet ungated.
- Von den 16 semantischen `--admin-*`-Farbtokens haben 15 ein bereits existierendes `@theme --color-*`-Ziel; nur `--color-danger` fehlt und wird in Task 2 ergänzt.
- `--sidebar-width` / `--sidebar-collapsed-width` werden ausschliesslich innerhalb `website/src/styles/` konsumiert (nur `admin-premium.css`); kein `.svelte`/`.astro`-Konsument.
- Genau zwei Stellen importieren `factory-tokens.css`: `global.css:2` (`@import`) und `AdminLayout.astro:3` (`import`). Beide werden entfernt.
- Der Google-Fonts-`@import` (Newsreader/Geist/Geist Mono) lebt heute in `factory-tokens.css:8` und ist die primäre Font-Ladequelle für die gesamte Seite; er muss beim Auflösen nach `global.css` wandern.
- `CQ02` (explizite `any`): unberührt — diese PR ändert nur `.css` plus eine Testdatei ohne `any`.

<!-- vitest: Test wird geändert (nicht neu angelegt) — der bestehende Guard-Test admin-token-alias.test.ts wird neu gefasst; test:inventory-Schritt ist in Task 8 enthalten. -->

## Task 1 — Guard-Test auf die neue Invariante umschreiben (RED)

Ersetze den Inhalt von `website/src/lib/__tests__/admin-token-alias.test.ts` vollständig
durch die neue Fassung. Sie liest jetzt `global.css` (die neue einzige Quelle) statt
`admin-foundation.css`, prüft dass jedes `--admin-*`-Farbtoken ein `@theme --color-*`
aliast, und dass `factory-tokens.css` nicht mehr existiert (keine zweite `:root`-Farbquelle).

```ts
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const stylesDir = resolve(here, '../../styles');
const globalCss = readFileSync(resolve(stylesDir, 'global.css'), 'utf8');

// After the consolidation, every semantic admin color token is a thin alias of a
// Tailwind @theme --color-* token, declared in exactly one source (global.css).
const COLOR_TOKENS = [
  '--admin-bg', '--admin-sidebar-bg', '--admin-surface', '--admin-surface-hover',
  '--admin-border', '--admin-border-bright', '--admin-primary', '--admin-primary-muted',
  '--admin-accent', '--admin-text', '--admin-text-mute', '--admin-text-disabled',
  '--admin-success', '--admin-danger', '--admin-info', '--admin-warning',
];

describe('admin color tokens alias the Tailwind @theme layer', () => {
  for (const token of COLOR_TOKENS) {
    it(`${token} aliases a @theme --color-* var in global.css`, () => {
      const m = globalCss.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
      expect(m, `${token} must be declared in global.css`).toBeTruthy();
      const value = (m![1] ?? '').trim();
      expect(value).toMatch(/^var\(--color-[a-z0-9-]+\)$/);
    });
  }

  it('factory-tokens.css is dissolved — no second :root color source', () => {
    expect(existsSync(resolve(stylesDir, 'factory-tokens.css'))).toBe(false);
  });
});
```

Run it on the current branch — it MUST fail: `global.css` does not yet declare the
`--admin-*` tokens and `factory-tokens.css` still exists.

```bash
cd website && npx vitest run src/lib/__tests__/admin-token-alias.test.ts
# expected: FAIL (red — the @theme aliases and the file deletion do not exist yet)
```

## Task 2 — Base tokens in die `@theme`-Einzelquelle (`global.css`) heben

Ziel: `global.css` trägt danach alle Basis-Farbtokens, die `--admin-*`-Aliase und
die aus `factory-tokens.css` migrierten Nicht-Farb-Assets — noch **ohne** die alte
Datei zu löschen (das passiert in Task 3).

1. **`--color-danger` im `@theme`-Block ergänzen** (neben `--color-sage`), damit
   `--admin-danger` ein `@theme`-Ziel bekommt:

   ```css
   /* Danger / destructive (migrated from factory-tokens.css) */
   --color-danger: #d77a6e;
   ```

2. **Google-Fonts-`@import` nach `global.css` verschieben.** Setze die Zeile
   `@import url("https://fonts.googleapis.com/css2?family=Newsreader...&display=swap");`
   aus `factory-tokens.css:8` direkt hinter `@import "tailwindcss";` (führende
   `@import`-Statements müssen vor allen anderen Regeln stehen).

3. **Noch referenzierte Nicht-Farb-Tokens aus `factory-tokens.css` verbatim in den
   bestehenden Shorthand-`:root`-Block von `global.css` (heute Zeilen 132–150)
   übernehmen** — sie haben reale Konsumenten und dürfen nicht verschwinden:
   - `--danger: var(--color-danger);` (6 Konsumenten; Literal → `@theme`-Alias)
   - `--radius-sm/-md/-lg/-pill` (9 Konsumenten; Werte 4px/10px/14px/999px)
   - `--dur-base: 180ms;` und `--ease-soft: cubic-bezier(.2,.7,.2,1);` (je 3 Konsumenten)
   - Der komplette `--factory-*`-Aliasblock (28 Konsumenten) — er referenziert nur
     `--ink-*`, `--fg`, `--fg-soft`, `--mute`, `--mute-2`, `--brass`, `--brass-2`,
     `--danger`, `--sage`, `--line`, `--line-2`, Radii und `--sans/-mono/-serif`,
     die alle in `global.css` verfügbar bleiben.
   - **Verworfen (verifiziert 0 Konsumenten, tot):** `--ink-700`, `--brass-soft`,
     `--brass-deep`, `--sage-2`, `--line-3`. Nicht übernehmen.

4. **Präsentationsregeln aus `factory-tokens.css` verbatim ans Ende von `global.css`
   übernehmen** (3 Konsumenten der `.ff-*`-Klassen; global.css war schon der
   effektive Ladeort via `@import`): `.factory-scroll`-Scrollbar-Regeln, `.ff-grain`,
   die `@keyframes ff-slide-in/-out`, `ff-fade-in/-out`, `ff-blocked-pulse`,
   `ff-pulse-ring`, `ff-pulse-ring-d`, `ff-pilot-breathe`, sowie `.ff-pill`,
   `.ff-pill:hover`, `.ff-pill--ghost`.

5. **Die 16 `--admin-*`-Farb-Aliase in einem eigenen `:root`-Block in `global.css`
   deklarieren**, jeweils als einzelne `var(--color-*)`-Referenz (deckungsgleich mit
   der Testregex `^var\(--color-[a-z0-9-]+\)$`):

   ```css
   /* Admin semantic color aliases — single source (was admin-foundation.css). */
   :root {
     --admin-bg:            var(--color-ink-900);
     --admin-sidebar-bg:    var(--color-ink-850);
     --admin-surface:       var(--color-ink-800);
     --admin-surface-hover: var(--color-ink-750);
     --admin-border:        var(--color-line);
     --admin-border-bright: var(--color-line-2);
     --admin-primary:       var(--color-brass);
     --admin-primary-muted: var(--color-brass-d);
     --admin-accent:        var(--color-brass);
     --admin-text:          var(--color-fg);
     --admin-text-mute:     var(--color-mute);
     --admin-text-disabled: var(--color-mute-2);
     --admin-success:       var(--color-sage);
     --admin-danger:        var(--color-danger);
     --admin-info:          var(--color-brass);
     --admin-warning:       var(--color-brass);
   }
   ```

Diese Werte sind computed-farbgleich zum Ist-Zustand: die 17 Basis-Shorthands werden
schon heute in `global.css:132–150` als `var(--color-*)` re-exportiert und gewinnen
die Kaskade gegen die (später importierten) Literale aus `factory-tokens.css`.

## Task 3 — `factory-tokens.css` löschen und beide Importe entfernen

- `git rm website/src/styles/factory-tokens.css`.
- In `global.css` die Zeile `@import "./factory-tokens.css";` entfernen.
- In `AdminLayout.astro` die Zeile `import '../styles/factory-tokens.css';` entfernen
  (die restliche Import-Kette `global.css → admin-foundation.css → admin-premium.css`
  bleibt unverändert).
- Gegenprüfung, dass keine weitere Referenz übrig ist:

  ```bash
  grep -rn "factory-tokens" website/src --include='*.astro' --include='*.css' --include='*.ts' --include='*.svelte'
  # erwartet: nur noch Kommentar-Treffer, kein @import / import
  ```

## Task 4 — `admin-foundation.css` auf reine Admin-Spezifika reduzieren

Aus `admin-foundation.css` die jetzt in `global.css` besitzenden Blöcke entfernen:
- Den Status-Farbblock (`--admin-success/-danger/-info/-warning`, heute Zeilen 31–35).
- Den Surfaces-&-Text-Block (`--admin-bg` … `--admin-text-disabled`, heute Zeilen 47–61).
- Die beiden Sidebar-Definitionen `--sidebar-width` / `--sidebar-collapsed-width`
  (heute Zeilen 63–64) — sie ziehen in Task 5 nach `admin-premium.css`.

**Behalten** (echte Admin-Spezifika): Spacing-Skala (`--space-*`), Typo-Skala
(`--admin-text-xs/-sm/-md/-lg`), Component-Tokens (`--admin-card-*`, `--admin-input-*`,
`--admin-table-row-height`, `--admin-modal-backdrop`), Z-Index-Skala (`--z-*`),
Animation (`--admin-transition-fast/-normal`) und die `body:has(#admin-sidebar)`-Regel.

## Task 5 — `--sidebar-width` in `admin-premium.css` konsolidieren (ein Owner)

In den bestehenden `:root`-Block von `admin-premium.css` (heute Zeile 227, direkt bei
`--admin-sidebar-w`/`--admin-sidebar-h`) die beiden Werte-Definitionen aufnehmen, sodass
`admin-premium.css` die einzige definierende Datei ist:

```css
:root {
  --sidebar-width: 16rem;
  --sidebar-collapsed-width: 4rem;
  --admin-sidebar-w: var(--sidebar-width);
  --admin-sidebar-h: 100vh;
}
```

CSS-Custom-Properties lösen zum Nutzungszeitpunkt auf, daher greifen die bestehenden
`var(--sidebar-width)`-Nutzungen in `admin-premium.css` (Zeilen 2, 9, 140) unabhängig
von der Deklarationsreihenfolge.

## Task 6 — Guard-Test GREEN + Konsumenten gegen die neue Quelle verifizieren

Nach Task 2–5 den Guard-Test erneut ausführen — er muss nun grün sein:

```bash
cd website && npx vitest run src/lib/__tests__/admin-token-alias.test.ts
# erwartet: PASS (16 Alias-Assertions grün + factory-tokens.css gelöscht)
```

Die ~36 bestehenden `--admin-*`-Farbkonsumenten werden **nicht umgeschrieben**, nur
gegen die neue Quelle verifiziert: jedes referenzierte `--admin-*`-Farbtoken ist jetzt
in `global.css` deklariert.

```bash
# Jedes von den 36 Dateien genutzte --admin-* Farbtoken muss in global.css deklariert sein.
grep -oE -- '--admin-(bg|sidebar-bg|surface|surface-hover|border|border-bright|primary|primary-muted|accent|text|text-mute|text-disabled|success|danger|info|warning)\b' \
  website/src -r 2>/dev/null | sed 's/.*://' | sort -u \
  | while read -r t; do grep -q -- "$t:" website/src/styles/global.css || echo "UNDECLARED: $t"; done
# erwartet: keine UNDECLARED-Zeile
```

## Task 7 — Bewusste Snapshot-Rebaseline / Visual-Regression-Review

Dieser Strang trägt das höchste Snapshot-Risiko im Epic; die Rebaseline geschieht
hier bewusst und dokumentiert. `tests/e2e/specs/visual-sweep.spec.ts` vergleicht
keine im Repo eingecheckten Pixel-Baselines, sondern erzeugt eine Galerie unter
`tests/results/visual-sweep/` und gated nur auf Route-Fehler (HTTP >= 400 / geworfene
Navigation). Vorgehen (läuft in der E2E-/Deploy-Phase gegen die deployte Brand):

```bash
# Visual-Sweep über die Admin-Routen; Snapshots werden bewusst neu erzeugt/geprüft.
task test:e2e -- tests/e2e/specs/visual-sweep.spec.ts --update-snapshots
```

- Die erzeugte Galerie (`tests/results/visual-sweep/<brand>/*`) auf unveränderte
  Admin-Farben durchsehen — erwartet ist Farb-Deckungsgleichheit, da die migrierten
  Werte identisch bleiben.
- Sollte die Suite später eingecheckte Playwright-`toHaveScreenshot`-Baselines
  bekommen, regeneriert `--update-snapshots` sie; die neuen PNGs werden mitcommittet.
- Ergebnis (keine Route-Fehler, Farben unverändert) im PR-Text festhalten.

## Task 8 — Abschluss-Verifikation (Pflicht-Gates)

Vor Commit sicherstellen, dass der OpenSpec-Change formatkonform ist:

```bash
task test:openspec         # OpenSpec-Format-Gate — muss grün sein
```

Weil eine Testdatei geändert wurde, das Test-Inventar regenerieren und mitcommitten:

```bash
task test:inventory        # regeneriert website/src/data/test-inventory.json
git add website/src/data/test-inventory.json
```

Dann die drei verpflichtenden CI-Gates ausführen:

```bash
task test:changed          # gezielte Tests für die geänderten Domains (vitest --changed + BATS + quality)
task freshness:regenerate  # generierte Artefakte aktualisieren
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4-Ratchet) + Baseline-Assertion
```

Alle drei müssen grün sein; die Baseline-Key-Anzahl darf nicht wachsen (diese PR fügt
keine gebaselineten Dateien hinzu und löscht `factory-tokens.css`, das ohnehin nicht
gebaselined war).
