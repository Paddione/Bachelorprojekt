---
title: "wsl-exit-hetzner2-decommission — Implementation Plan"
ticket_id: T016425
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# wsl-exit-hetzner2-decommission — Implementation Plan

_Ticket: T016425_

## File Structure

```
docs/runbooks/decommission-k3s-node.md          # NEU: Runbook (Reihenfolge + manuelle Gates)
scripts/factory/verify-decommission.sh          # NEU: rein lesende Verifikation (bash, set -euo pipefail)
tests/spec/fleet-operations/hetzner2-decommission.bats   # NEU: Runbook-/Skript-Invarianten
```

## Tasks

- [x] **Runbook schreiben.** Abschnitte: 1) Vorprüfung (`kubectl get pods -A
      -o wide | grep hetzner-2`, Local-PV/Local-Path-Provisioner-Check), 2)
      `kubectl delete node gekko-hetzner-2` (MANUELL, Operator), 3)
      Longhorn-Rebuild auf hetzner-3/-4 beobachten (`kubectl -n
      longhorn-system get volumes.longhorn.io -o wide`), 4) Prometheus-PVC:
      `robustness` wieder `healthy`, 5) Hetzner-Kündigung (MANUELL). Jeder
      destruktive Schritt trägt die Markierung „MANUELL — Operator".
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `docs/runbooks/decommission-k3s-node.md` liegt auf `main` (PR #5249).
- [x] **Verifikationsskript.** `verify-decommission.sh`: Exit 0 wenn (a) Node
      abwesend, (b) keine `replicas.longhorn.io` mit Backing-Image/Node auf
      hetzner-2, (c) alle Longhorn-Volumes `robustness=attached & healthy`.
      Nur lesende kubectl-Aufrufe.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `scripts/factory/verify-decommission.sh` liegt auf `main` (PR #5249).
- [x] **BATS-Test.** Prüft: Runbook existiert und enthält die fünf Abschnitte
      inkl. MANUELL-Gates; Skript enthält kein schreibendes kubectl-Verb
      (`create|apply|delete|patch|edit|drain|cordon` außer in Kommentaren).
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `tests/spec/fleet-operations/hetzner2-decommission.bats` liegt auf `main` (PR #5249).

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** BATS-Test anlegen — er muss FAILen, weil
      Runbook/Skript noch fehlen.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Test-Datei auf `main`; PR #5249 folgte dem RED→GREEN-Schritt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/hetzner2-decommission.bats
# expected: FAIL (red — runbook and verify script do not exist yet)
```

- [x] **Fix-Step (GREEN).** Artefakte anlegen; Test grün; Shellcheck über das
      Skript.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Runbook, Skript und Test liegen gemeinsam auf `main` (PR #5249).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/hetzner2-decommission.bats
shellcheck scripts/factory/verify-decommission.sh
```

- [x] **Final Verification.** Die drei Pflicht-Gates:
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Über den gemergten PR #5249 belegt (Repo-Regel 4: CI grün vor Merge).

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
