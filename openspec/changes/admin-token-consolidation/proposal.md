# Proposal: admin-token-consolidation

_Ticket: T001787 · Epic: T001786 · Design-Spec: docs/superpowers/specs/2026-07-10-admin-foundation-design.md §T1_

## Why

Dieselbe Admin-Farbe existiert auf **drei Ebenen**: `--color-fg` (Tailwind `@theme` in
`global.css`), `--fg` (`factory-tokens.css`, von `global.css` importiert), und `--admin-text`
(`admin-foundation.css`). 17 Basisnamen sind zwischen `global.css` und `factory-tokens.css`
doppelt; `--sidebar-width` ist dreifach definiert. Jede neue Admin-Komponente muss raten, welche
Ebene sie ansprechen soll — die `--admin-*`-Alias-Schicht wird nur in 24 von 52 Komponenten mit
`<style>`-Block benutzt. Ein Guard-Test (`admin-token-alias.test.ts`) bewacht die Naht, statt das
Problem aufzulösen.

## What

- `factory-tokens.css` **ersatzlos auflösen**; seine Basisnamen als `@theme`-Einträge nach
  `global.css` übernehmen (Tailwind `@theme` wird die **einzige** Farb-Token-Quelle).
- `admin-foundation.css` behält nur echte Admin-Spezifika (`--space-*`, `--z-*`,
  `--admin-transition-*`, Component-Tokens) und verliert alle **Farb-Aliase**. Farb-`--admin-*`
  dürfen als dünne `@theme`-Semantik-Aliase bestehen bleiben (`--color-admin-text: var(--color-fg)`),
  aber nicht mehr in zwei Dateien dupliziert werden.
- `--sidebar-width` nur noch **einmal** definiert (`admin-premium.css` als Owner der Sidebar-Optik);
  die zwei Dubletten entfernen.
- `admin-token-alias.test.ts` **neu fassen**: bewacht künftig „`--admin-*`-Farbtokens aliasen ein
  `@theme --color-*`" und „keine Farb-Dublette zwischen `@theme` und einer zweiten `:root`-Quelle".
- Die 24 Dateien mit `--admin-*`-Farbnutzung bleiben gültig (die Aliase existieren weiter), werden
  aber gegen die neue Quelle verifiziert.

**Risiko:** Höchstes Snapshot-Risiko im Epic (`visual-sweep.spec.ts`). Läuft **zuerst**; Snapshots
werden einmal bewusst neu baseliniert. CSS ist im S1-Ratchet ungated.
