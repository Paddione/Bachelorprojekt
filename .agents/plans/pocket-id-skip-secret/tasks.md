---
title: pocket-id-client-seed Skip greift bei nicht konfiguriertem Secret
ticket_id: T901061
domains: [infra, auth]
status: implemented
---

# pocket-id-skip-secret — Implementation Plan

## File Structure

- `k3d/pocket-id-client-seed.yaml` — Seed-Skript: Fix der eval-Zeile für indirekte Variablenexpansion
- `tests/spec/pocket-id-client-seed-skip-secret.bats` — Bats-Spec: Prüft, dass Clients ohne Secret übersprungen werden und mit Secret verarbeitet werden
- `components/website/src/data/test-inventory.json` — Inventareintrag für pocket-id-client-seed-skip-secret.bats
- `.agents/plans/pocket-id-skip-secret/tasks.md` — dieser Index
- `.agents/plans/pocket-id-skip-secret/tasks.d/p1-skip-secret-fix.md` — Fix der eval-Zeile
- `.agents/plans/pocket-id-skip-secret/tasks.d/p2-skip-secret-tests.md` — Testabnahme und Regression

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| P1 | tasks.d/p1-skip-secret-fix.md | impl | k3d/pocket-id-client-seed.yaml |  |
| P2 | tasks.d/p2-skip-secret-tests.md | tests | tests/spec/pocket-id-client-seed-skip-secret.bats | P1 |

## Root Cause (belegt)

Symptom (Fakt, live 2026-10-05): Der Seed-Job verarbeitet jede ROWS-Zeile, auch ohne konfiguriertes Secret. Der Zweig `skip <cid> (no secret configured)` wird nie erreicht. Fehlende Clients werden mit neu generiertem Secret angelegt und in workspace-secrets zurückgeschrieben.

Ursache (belegt): `k3d/pocket-id-client-seed.yaml` enthält:
`secret=$(eval "printf '%s' \"\$$env\"")`
Flux `postBuild` ersetzt `$$` durch `$`. Im gerenderten Cluster-Job landet:
`secret=$(eval "printf '%s' \"\$env\"")`
Beim Ausführen durch `sh` expandiert die äußere Doppelquote `\$env` zu `$env`, und `eval` führt `printf '%s' "$env"` aus. Das liefert den Namen der Umgebungsvariablen (z. B. `"SECRET_downloads"`), nie ihren Wert. Daher ist `[ -z "$secret" ]` in `upsert()` immer `false`.

Fix:
Ersetzen der `eval`-Zeile durch:
`eval 'secret="$'$env'"'`
(Alternativ im YAML: `eval "secret=\"\\$$$$env\""`, welches nach Flux zu `eval "secret=\"\$$env\""` wird).
Die Variante `eval 'secret="$'$env'"'` ist robust gegenüber Flux-Substitutionen (keine `$$`-Abhängigkeit) und weist `$secret` in POSIX `sh` den tatsächlichen Wert der Variablen zu (bzw. leer, falls die Variable ungesetzt oder leer ist).

## Task 1 — P1 umsetzen

Siehe `tasks.d/p1-skip-secret-fix.md`.

## Task 2 — P2 Testabnahme

Siehe `tasks.d/p2-skip-secret-tests.md`.

## Task 3 — Verify

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-skip-secret.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/pocket-id-client-seed*
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
