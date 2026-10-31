---
title: "fix-opencode-writable-home — Implementation Plan"
domains: [infra, devmesh, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-opencode-writable-home — Implementation Plan

Behebt Issue #6941: Deployment `workspace/opencode` (devmesh) im CrashLoopBackOff.

## Root Cause (log-belegt, T002448-M5)

- Symptom (Fakt): Pod `opencode-6c9b667896-48jxx`, 55 Restarts, Log:
  `PlatformError: PermissionDenied: FileSystem.makeDirectory (/root/.local/share/opencode/log)`
  + `[cause]: EACCES: permission denied, mkdir '/root/.local/share/opencode/log'`.
- Ursache (Hypothese → belegt): `dev-local/components/opencode/opencode.yaml`
  setzt `runAsUser: 65534` (non-root), aber kein `HOME`-Env. Der Server loest
  sein Datenverzeichnis gegen `/root` auf → EACCES. Manifest-Evidenz:
  Pod-`securityContext` (runAsNonRoot/runAsUser 65534), kein `env:` am
  Container, einziger Mount `/workspace`.
- Entscheidung: `HOME=/tmp` + `emptyDir`-Mount auf `/tmp` (Praezedenz T900810,
  `dev-local/components/k1-embed/k1-embed-cronjob.yaml`: HOME=/tmp +
  tmp-Mount fuer runAsUser 65534). Verworfen: `runAsUser 0` (Non-Root-Policy),
  `HOME=/workspace` (mischt Server-State ins User-Volume, kein Mehrwert bei
  Recreate-Strategie + forwardAuth ohne lokale Secrets).
- Kein Brainstorming-Skill in dieser Umgebung vorhanden (Abweichung notiert);
  Root-Cause-Analyse oben ersetzt Schritt 2.8 ersatzweise inline.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `tests/py/spec/devmesh/test_opencode_writable_home.py` | neu (RED) | Budget 737 (Limit `.py`) |
| `dev-local/components/opencode/opencode.yaml` | 103 | n/a (YAML ohne S1-Limit) |

## Tasks

### Task 0 — RED-Beleg (failing Test)

- [ ] RED ausfuehren: `bash scripts/pytest-run.sh tests/py/spec/devmesh/test_opencode_writable_home.py` — expected FAIL (2 failed, 1 passed: HOME-Env fehlt, Non-Root-Guard gruen).
- [ ] Beleg ist erbracht (2026-10-26, Worktree `fix/opencode-writable-home`); Re-Run im Execute dokumentiert den Ausgangszustand vor Task 1.

### Task 1 — Manifest-Fix: beschreibbares HOME

- [ ] In `dev-local/components/opencode/opencode.yaml`, Container `opencode`:
  `env: [{name: HOME, value: "/tmp"}]` ergaenzen (Kommentar mit `#6941`).
- [ ] `volumes:` um `emptyDir`-Volume `tmp` erweitern, `volumeMounts:` um
  `mountPath: /tmp` ergaenzen. Existierender `workspace-data`-Mount unveraendert.
- [ ] `securityContext` (Pod + Container) unveraendert non-root lassen.
- [ ] Gate: `bash scripts/pytest-run.sh tests/py/spec/devmesh/test_opencode_writable_home.py` → 3 passed.

### Task 2 — Verifikation & No-Prod-Touch

- [ ] `bash scripts/pytest-run.sh tests/py/spec/devmesh/test_opencode_writable_home.py` → 3 passed (GREEN).
- [ ] `task workspace:validate` (Kustomize dry-run) gruen.
- [ ] `./tests/runner.sh local opencode` (Manifest-Aenderung → Runner-Pflicht).
- [ ] Freshness (generated_artifacts=true): `task freshness:regenerate`, dann `task freshness:check` gruen.
- [ ] Scope-Gate: Diff enthaelt nur `dev-local/components/opencode/*` +
  `tests/py/spec/devmesh/test_opencode_writable_home.py` (kein `prod-*`,
  kein `fleet/`, kein Mentolder-Bezug).
- [ ] `task test:changed` gruen.

## Uebegabe

Branch `fix/opencode-writable-home`, RED-Test + dieser Plan. Kein PR aus diesem
Skill (STOPP nach Push); Umsetzung via `dev-flow-execute`. Deployment folgt
danach ueber den bestehenden devmesh-Sync (Flux `devmesh-workspace`, kein
manueller `kubectl apply` — wuerde revertiert).
