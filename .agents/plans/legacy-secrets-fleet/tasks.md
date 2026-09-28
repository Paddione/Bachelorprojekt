---
title: "legacy-secrets-fleet — Implementation Plan"
ticket_id: T900789
domains: [infra, security, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# legacy-secrets-fleet — Implementation Plan

`ENV=mentolder`/`ENV=korczewski` lesen und wenden noch die Legacy-Secret-Dateien an, die mit dem
fleet-Cert gesealt und inhaltlich veraltet sind (FILEN_*). Ein neues Env-Feld `secrets_env` leitet
auf `fleet-<brand>` um, danach entfallen die Legacy-Dateien. Design und Belege: `design.md`.

_Ticket: T900789_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/lib/secrets-env.sh` | 0 (neu) | 800 |
| `scripts/env-seal.sh` | 427 | 373 |
| `scripts/secret-rotate.sh` | 71 | 729 |
| `scripts/claude-key-picker.sh` | 177 | 623 |
| `taskfiles/Taskfile.platform.yml` | 793 | n/a (S1-ungated) |
| `taskfiles/Taskfile.workspace.yml` | 1305 | n/a (S1-ungated) |
| `taskfiles/Taskfile.web.yml` | 697 | n/a (S1-ungated) |
| `environments/mentolder.yaml`, `environments/korczewski.yaml` | — | n/a |
| `environments/.secrets/{mentolder,korczewski}.yaml`, `environments/sealed-secrets/{mentolder,korczewski}.yaml` | — | geloescht |
| `docs/superpowers/references/secrets-architecture.md` | — | n/a |
| `tests/spec/legacy-secrets-fleet.bats` und angepasste Bestandstests | — | n/a (S1-ungated) |

Budget geprueft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <datei>`.

<!-- vitest: kein neuer Test noetig, weil keine Datei unter components/website/src geaendert wird -->

## Partials

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-resolve.md | impl | scripts/lib/secrets-env.sh, scripts/env-seal.sh, scripts/secret-rotate.sh, scripts/claude-key-picker.sh, taskfiles/Taskfile.platform.yml, taskfiles/Taskfile.workspace.yml, taskfiles/Taskfile.web.yml, environments/mentolder.yaml, environments/korczewski.yaml | | 27b-local | 32000 |
| p2 | tasks.d/p2-remove.md | impl | environments/.secrets/mentolder.yaml, environments/.secrets/korczewski.yaml, environments/sealed-secrets/mentolder.yaml, environments/sealed-secrets/korczewski.yaml, docs/superpowers/references/secrets-architecture.md | p1 | 4b-local | 8000 |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/legacy-secrets-fleet.bats, tests/spec/fleet-operations.bats, tests/unit/secrets-sync.bats, tests/spec/secrets-deploy-automation.bats, tests/spec/health-goals.bats | p2 | 4b-local | 16000 |

## Task: Failing Test bestaetigen

```bash
bats tests/spec/legacy-secrets-fleet.bats
```

expected: FAIL (vor p1/p2; alle vier Tests rot).

## Task: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
