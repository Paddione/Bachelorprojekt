# cq02-any-types-200

## Purpose

SSOT spec.

## Requirements

### Requirement: Obergrenze für explizite any-Typen in website/src

The system SHALL keep the number of explicit `any` usages in `website/src` at or below 200,
counted as occurrences of `: any`, `<any>`, or `as any` across `*.ts`, `*.svelte`, and `*.astro`
files. Type assertions that bridge through `unknown` (`as unknown as T`), generic type parameters,
and locally declared interfaces SHALL be preferred over `any`; `@ts-ignore` and `@ts-expect-error`
SHALL NOT be introduced as substitutes for `any`.

#### Scenario: any-Zähler liegt unter der Obergrenze

- **GIVEN** das `website/`-Paket ist ausgecheckt
- **WHEN** `grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l` ausgeführt wird
- **THEN** ist das Ergebnis ≤ 200

#### Scenario: TypeScript-Check bleibt grün

- **GIVEN** die any-Reduktion ist angewandt
- **WHEN** `pnpm --dir website run astro:check` ausgeführt wird
- **THEN** beendet sich der Check mit 0 TypeScript-Fehlern — die Typsicherheit wurde nicht durch
  Unterdrückungs-Kommentare erkauft

### Requirement: Fail-Closed BATS-Gate für any-Obergrenze

The system SHALL enforce the ≤200 any-budget via a BATS test at
`tests/spec/g-cq02-any-types.bats` that fails when the explicit-any count in `website/src` exceeds
200, so that regressions are blocked by the offline test suite.

#### Scenario: BATS-Test blockiert Regression

- **GIVEN** `tests/spec/g-cq02-any-types.bats` ist vorhanden
- **WHEN** der any-Zähler in `website/src` über 200 steigt
- **THEN** schlägt der BATS-Test fehl (Exit-Code ≠ 0) und das Offline-Test-Gate blockiert den Merge

<!-- merged from change delta cq02-any-types-200.md on 2026-06-28 -->