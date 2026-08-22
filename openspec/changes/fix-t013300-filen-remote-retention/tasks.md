---
title: "fix-t013300-filen-remote-retention — Implementation Plan"
ticket_id: T013300
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-t013300-filen-remote-retention — Implementation Plan

_Ticket: T013300_

## File Structure

```
k3d/backup-cronjob.yaml                                  # Retention-Block im filen-upload Sidecar + CLI-Pin
k3d/pvc-backup-cronjob.yaml                              # dto. (MJOB-Heredoc, \${}-Escaping)
tests/spec/backup-pipeline/filen-remote-retention.bats   # neu — Struktur- + Stub-Funktionstests
docs/superpowers/references/shared-infrastructure-security.md  # Retention-Zeile korrigieren
openspec/changes/fix-t013300-filen-remote-retention/     # dieser Change
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** BATS-Suite gegen die unveränderten Manifeste
      läuft rot (11/11 fail, verifiziert via `git stash`-RED-Lauf).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/backup-pipeline/filen-remote-retention.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [x] **Fix-Step (GREEN).** Retention-Blöcke in beiden Manifesten implementiert;
      Suite grün (11/11), YAML-Validität und POSIX-sh-Syntax der eingebetteten
      Skripte per python-yaml + `sh -n` geprüft, Delete-Satz-Funktion gegen
      Stub-CLI verifiziert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/backup-pipeline/filen-remote-retention.bats
# expected: PASS (11 tests)
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
