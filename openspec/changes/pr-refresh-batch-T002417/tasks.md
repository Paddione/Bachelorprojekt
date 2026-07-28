---
title: "pr-refresh-batch-T002417 — Implementation Plan"
ticket_id: T002417
domains: [ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pr-refresh-batch-T002417 — Implementation Plan

_Ticket: T002417_

## File Structure

```
tests/spec/ci-cd/pr-refresh-batch.bats   (neu)  — Sammellauf-Tests
scripts/pr-refresh.sh                    (geändert) — _reject, Bilanz-Kategorien, main()-Bilanz
openspec/changes/pr-refresh-batch-T002417/specs/ci-cd.md (neu) — Delta-Spec
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Vier BATS-Tests in einer eigenen Datei nach der
      Verzeichniskonvention aus T002416. Der gh-Stub wird auf ein Fixture-*Verzeichnis*
      erweitert, weil ein Sammellauf pro PR-Nummer eine eigene Antwort braucht.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/pr-refresh-batch.bats
# expected: FAIL (rot — 3 von 4, der Fix fehlt noch)
```

- [x] **Fix-Step (GREEN).** `_reject` einführen, `process_pr` auf drei Rückgabewerte
      umstellen, `main()` mit Zählern und Bilanzzeile, Worktree-Aufräumen im
      Fehlerpfad von `_refresh_branch`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/pr-refresh-batch.bats
# 4/4 ok
tests/unit/lib/bats-core/bin/bats tests/spec/pr-refresh.bats
# 8/8 ok — keine Regression an den Einzelaufruf-Tests
```

- [ ] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
