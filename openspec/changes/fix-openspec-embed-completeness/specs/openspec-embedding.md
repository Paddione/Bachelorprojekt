## ADDED Requirements

### Requirement: Completeness-Gate zählt lokale Pläne per Slug und wertet Toleranz

The completeness gate in `scripts/openspec-embed.mjs` SHALL compare the set of locally active
plan slugs (status in `ACTIVE_STATUSES`, i.e. `planning|plan_staged|active`) against the set of
slugs present in the `specs_plans` collection per slug instead of comparing the raw collection
document count against the local active count, so that stale collection entries for
no-longer-active plans can neither mask missing active plans nor trigger a false mismatch. The
gate SHALL log a line starting with `WARN: completeness gate` (which the wrapper
`scripts/openspec-embed-local.sh` escalates to a failure) whenever the share of missing local
active plans exceeds a configurable tolerance (`OPENSPEC_EMBED_COVERAGE_TOLERANCE`, default
0.10 = 10 %), and SHALL log `completeness gate OK` otherwise.

#### Scenario: Diskrepanz über der Toleranz wird als Fehler gemeldet

- **GIVEN** die Collection enthält 1 von 3 lokal aktiven Plänen (2 fehlen = 66 % > 10 % Toleranz)
- **WHEN** das Completeness-Gate nach einem Embedding-Lauf prüft
- **THEN** loggt das Gate eine Zeile, die mit `WARN: completeness gate` beginnt
- **AND** die Zeile nennt die fehlenden Slugs

#### Scenario: Diskrepanz innerhalb der Toleranz bleibt ein Erfolg

- **GIVEN** die Collection enthält 3 von 3 lokal aktiven Plänen (0 fehlen ≤ 10 % Toleranz)
- **WHEN** das Completeness-Gate nach einem Embedding-Lauf prüft
- **THEN** loggt das Gate eine Zeile, die mit `completeness gate OK` beginnt

### Requirement: Stale Collection-Einträge verfälschen die Coverage-Zählung nicht

The completeness gate SHALL compute coverage from the DISTINCT set of slugs in the
`specs_plans` collection (`metadata->>'slug'`), not from the total document count, so documents
belonging to plans that are no longer active (status changed to `archived`, `done` or missing
after indexing) do not count toward coverage and do not mask missing active plans.

#### Scenario: Stale Einträge zählen nicht als Abdeckung

- **GIVEN** die Collection enthält Dokumente für 2 inaktive Pläne und 1 aktiven Plan
- **AND** es existieren 3 lokal aktive Pläne
- **WHEN** das Completeness-Gate die Coverage berechnet
- **THEN** zählen nur die 2 inaktiven Dokumente nicht als Treffer (coverage = 1/3)
- **AND** das Gate meldet die 2 fehlenden aktiven Pläne als WARN (66 % > 10 %)
