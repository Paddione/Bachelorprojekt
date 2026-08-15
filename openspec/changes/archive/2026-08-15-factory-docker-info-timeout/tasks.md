---
title: "factory-docker-info-timeout — Implementation Plan"
ticket_id: T006303
domains: [factory, scripts, tests]
status: active
file_locks:
  - scripts/factory/sandbox-run.sh
  - scripts/factory/wakeup.sh
  - tests/spec/software-factory/docker-info-timeout.bats
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-docker-info-timeout — Implementation Plan

_Ticket: T006303_

## File Structure

```
scripts/factory/sandbox-run.sh                        ← resolve_mode: docker-Probe mit `timeout 10` (Z.45)
scripts/factory/wakeup.sh                             ← Sandbox-Preflight: docker-Probe mit `timeout 10` (Z.209)
tests/spec/software-factory/docker-info-timeout.bats  ← 2 RED-Tests (T006303) — liegen bereits in diesem Branch
openspec/changes/factory-docker-info-timeout/         ← dieses Change (Proposal + SSOT-Delta)
website/src/data/test-inventory.json                  ← Regeneration (CI-Gate test:inventory)
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Run the new T006303 tests. Both must FAIL on the
      current branch — der Timeout-Guard ist noch nicht eingebaut (docker-Stub
      haengt 30s, die Aufloesung ueberschreitet die 20s-Zeitgrenze).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/docker-info-timeout.bats
# expected: FAIL (red — beide Tests scheitern an [ "$elapsed" -lt 20 ])
```

- [x] **Fix-Step (GREEN).** Two targeted changes, same pattern: `timeout 10` vor
      `docker info` — Exit 124 (Timeout) zaehlt als „Docker nicht verfuegbar" und
      die Fallback-Kette docker → k8s → off laeuft weiter. Kein Verhalten im
      Happy-Path geaendert (Daemon antwortet <10s → wie bisher).

  1. **`scripts/factory/sandbox-run.sh` Z.45 (`resolve_mode`):**
     ```bash
     if timeout 10 docker info >/dev/null 2>&1; then echo docker; return 0; fi
     ```

  2. **`scripts/factory/wakeup.sh` Z.209 (Sandbox-Preflight):**
     ```bash
     if timeout 10 docker info >/dev/null 2>&1; then
       export FACTORY_SANDBOX=docker
     ```

- [x] **SSOT-Delta liegt vor.** `openspec/changes/factory-docker-info-timeout/specs/software-factory.md`
      (Requirement „Docker-Probe der Backend-Selektion zeitbegrenzt", ADDED auf
      `openspec/specs/software-factory.md`) ist in diesem Branch enthalten — nach
      dem Merge via `openspec archive` in die SSOT ueberfuehren.

- [x] **GREEN-Beweis.** Run the tests again — both must pass now (Exit-Code 0,
      Positiv-Anker, `elapsed < 20`).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/docker-info-timeout.bats
# expected: PASS (green)
```

- [x] **Abschluss-Verifikation.** Plan-Lint, OpenSpec-Validierung, Test-Inventar
      und Offline-Gates — alles gruen, bevor der PR gemergt wird.

```bash
bash scripts/plan-lint.sh openspec/changes/factory-docker-info-timeout/tasks.md
bash scripts/openspec.sh validate
task test:changed
task test:inventory          # regeneriert website/src/data/test-inventory.json (CI-Gate)
task freshness:regenerate
task freshness:check
```
