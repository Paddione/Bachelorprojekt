---
title: "devmesh-grand-consolidation — Implementation Plan"
ticket_id: T900115
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devmesh-grand-consolidation — Implementation Plan

_Ticket: T900115 · Design: `openspec/changes/devmesh-grand-consolidation/design.md` · Deltas: `specs/local-dev-mesh.md` (ADDED, 4 Requirements)_

## Partial-Manifest

| Partial | Ticket | Target files (disjunkt) | Gate |
|---|---|---|---|
| P0 verify | T900116/T900119/T900110 | keine (nur Guard-Läufe) | muss GREEN sein vor P1–P3 |
| P1 longhorn | T900181 | `scripts/devmesh/longhorn-prereqs.sh` (neu), `scripts/devmesh/longhorn-install.sh` (neu), `k3d/dev-cluster/longhorn-install.sh` (entfernt), `tests/spec/local-dev-mesh/longhorn-storage.bats` (neu) | P0 |
| P2 git-crypt-gpg | T900113 | `docker/dev-shell/Dockerfile`, `docs/runbooks/git-crypt-key-distribution.md`, `.git-crypt/keys/**` (neu), `tests/spec/dev-machine-onboarding/git-crypt-gpg.bats` (neu) | P0 (RBAC-Re-Check) |
| P3 k3d-decommission | T900120 | FACTORY_CTX-Referenzen, `Taskfile.sdlc`/`Taskfile.devmesh`, `tests/spec/local-dev-mesh/no-k3d-context.bats` (erweitern), Ausführung `migrate-from-k3d.sh` → `acceptance.sh` → `k3d-teardown.sh` | P1 + P2 abgenommen |

P1 und P2 sind parallelisierbar (disjunkte Files). P3 läuft zuletzt.

## File Structure

```
openspec/changes/devmesh-grand-consolidation/
  proposal.md  design.md  tasks.md  specs/local-dev-mesh.md
scripts/devmesh/longhorn-prereqs.sh      (P1, neu)
scripts/devmesh/longhorn-install.sh      (P1, neu)
k3d/dev-cluster/longhorn-install.sh      (P1, entfernt)
tests/spec/local-dev-mesh/longhorn-storage.bats      (P1, neu)
docker/dev-shell/Dockerfile              (P2)
docs/runbooks/git-crypt-key-distribution.md          (P2)
.git-crypt/keys/default/0/*.gpg          (P2, neu via add-gpg-user)
tests/spec/dev-machine-onboarding/git-crypt-gpg.bats (P2, neu)
```

## P0 — Verifikation (dateilos)

- [x] **P0.1** Re-Run: `bash tests/bats tests/spec/local-dev-mesh/tailnet-policy.bats tests/spec/local-dev-mesh/tailnet-check.bats` → 12/12 ok (T900116).
- [x] **P0.2** Re-Run: `bash tests/bats tests/spec/dev-machine-onboarding/` → alle ok (T900119).
- [x] **P0.3** Re-Run: `bash tests/bats tests/spec/security/workload-exec-rbac.bats tests/spec/security/cluster-admin-audit.bats tests/spec/software-factory/tick-http-wakeup.bats` → alle ok (T900110, entblockt P2).

## P1 — Longhorn 1.11.2 [T900181]

- [x] **P1.1 Commit (RED):** `tests/spec/local-dev-mesh/longhorn-storage.bats` — prüft Preconditions-Skript (Exit-Codes, Idempotenz-Meldung), Default-StorageClass-Flag (gegen Fixture/manifest), `devc`-Freiheit der Install-Pfade.
  ```bash
  bash tests/bats tests/spec/local-dev-mesh/longhorn-storage.bats
  # expected: FAIL (red — Skripte noch nicht vorhanden)
  ```
- [x] **P1.2** `scripts/devmesh/longhorn-prereqs.sh <host>`: open-iscsi + iscsid + `iscsi_tcp`, nfs-common, cryptsetup + `dm_crypt`, device-mapper, Mount-Propagation; idempotent; Exit 2 bei fehlender Vorbedingung (Stil `scripts/devmesh/*.sh`, `set -euo pipefail`).
- [x] **P1.3** `hddthin`-Auflösung + `sda`/`sdb`-Vorbereitung gpu-metal als dokumentierter Abschnitt in P1.2 oder eigenem Schritt (Thin-Pool war inaktiv, Data% 0.00 — Ticketlage).
- [x] **P1.4** `scripts/devmesh/longhorn-install.sh`: Longhorn 1.11.2 auf ctx `devmesh`, `local-path`-Default-Flag entfernen, Disk-Registrierung je Knoten; `k3d/dev-cluster/longhorn-install.sh` (v1.7.2/`devc`) entfernen.
- [x] **P1.5 Commit (GREEN):** P1.1-Bats ist GREEN; Kapazität nach Rollout messen und in Ticket T900181 notieren (nicht schätzen).
- [ ] **Stale-Pflege:** T900180 (gpu-cluster-3-Join) als Follow-up im Ticket vermerken, kein Gate.

## P2 — git-crypt per GPG [T900113]

- [x] **P2.1 Commit (RED):** `tests/spec/dev-machine-onboarding/git-crypt-gpg.bats` — Dockerfile enthält `gnupg`, Runbook nennt GPG_TTY/agent-Lebensdauer, `.git-crypt/keys/default/0/*.gpg` vorhanden.
  ```bash
  bash tests/bats tests/spec/dev-machine-onboarding/git-crypt-gpg.bats
  # expected: FAIL (red — gnupg fehlt, keine GPG-User)
  ```
- [x] **P2.2** `docker/dev-shell/Dockerfile`: `gnupg + pinentry-tty` zurück (in T900111 entfernt); Image baut (`docker build` des dev-shell-Kontexts).
- [ ] **P2.3** Zeremonie (manuell, einmalig, braucht entsperrten Checkout via Keyfile): `git-crypt add-gpg-user` für patrick/gekko, Commit der `.gpg`-Keyfiles; danach `git-crypt unlock` ohne Keyfile verifizieren; GPG_TTY/agent-Lebensdauer + Private-Key-Ablage `/home/dev` im Runbook dokumentieren.
- [x] **P2.4 Commit (GREEN):** P2.1-Bats ist GREEN.

## P3 — SP-5 k3d-Rückbau [T900120]

- [ ] **P3.1** `migrate-from-k3d.sh` (read-only Quelle) + Zeilenzahl-Vergleich je Tabelle; `acceptance.sh` auf devmesh GREEN. Bei Rot: STOPP, kein Teardown.
- [ ] **P3.2** FACTORY_CTX-, Taskfile.sdlc/devmesh-, Guard- und CLAUDE.md-Umstellung auf devmesh; `no-k3d-context.bats` deckt die umgestellten Pfade ab.
- [ ] **P3.3** `k3d-teardown.sh` ausführen; `k3d cluster list` ohne `mentolder-dev`; Ticket T900115 schließt mit P3-Merge.

## Verify (RED → GREEN)

- [x] P1.1 RED gesehen (`expected: FAIL`), P1.5 GREEN.
- [x] P2.1 RED gesehen (`expected: FAIL`), P2.4 GREEN.
- [ ] P0 + P3-Guards GREEN nach Abschluss.

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Stale-Schließungen (kein Code, separat)

T900099 (Provider heißt absichtlich `llamacpp-local`, `.opencode/agent-models.jsonc:5,371`), T900091 (Agent existiert, ebd.), T900079, T900085 → als stale/done schließen mit Begründung, nicht in diesen Change einplanen.
