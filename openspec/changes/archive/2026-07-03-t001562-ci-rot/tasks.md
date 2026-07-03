---
title: "t001562-ci-rot — Implementation Plan"
ticket_id: T001562
domains: [infra, test]
status: active
file_locks: [k3d/secrets.yaml, tests/spec/ci-cd.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001562-ci-rot — Implementation Plan

_Ticket: T001562 · Branch `fix/t001562-ci-rot`_
_Design: `docs/superpowers/specs/2026-07-03-t001562-ci-rot-design.md`_

## File Structure

**Geändert (2):**

| Datei | Typ / Limit | S1-Budget | Anmerkung |
|---|---|---|---|
| `k3d/secrets.yaml` | `.yaml` / ungated | 0 (ungated) | -5 Zeilen (nur Entfernung) |
| `tests/spec/ci-cd.bats` | `.bats` / ungated | 0 (ungated) | +23 Zeilen (RED→GREEN test) |

> Der Fix entfernt 5 Zeilen und fügt 23 Zeilen Test hinzu — netto +18 Zeilen, kein Ratchet-Risiko.
> S3-Disziplin: keine Brand-Domain-Literale in den Test-Snippets.

## Task 1 — RED: T001562-YAML-Failing-Test (bereits geschrieben)

**target_files:** `tests/spec/ci-cd.bats`

Der Test `T001562: alle k3d/*.yaml parsen als gültiges Multi-Document-YAML` wurde bereits
in die bestehende `tests/spec/ci-cd.bats` eingefügt. Er nutzt `python3 -c yaml.safe_load_all`
und parst alle `.yaml`/`.yml`-Dateien in `k3d/`.

**Step (RED) — Test läuft rot, weil k3d/secrets.yaml YAML-Debris enthält:**

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-ci-rot
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "T001562"
# expected: FAIL — secrets.yaml hat invalides YAML (lines 131-135)
```

## Task 2 — Fix: invalide Zeilen aus k3d/secrets.yaml entfernen

**target_files:** `k3d/secrets.yaml`

Entferne die 5 Zeilen mit Deployment-Env-Stanza-Debris (lines 131-135 im aktuellen Stand):

- `            - name: POCKET_ID_BRAIN_SECRET`
- `              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_BRAIN_SECRET, optional: true } }`
- `---`
- `  # ────────────────────────────────────────────────────────────────`
- `  # Brain Static Site — mentolder-only SSO gateway`

Der Rest der Datei bleibt unverändert. Der `POCKET_ID_BRAIN_SECRET`-Key im `workspace-secrets`-Data-Block
bleibt erhalten — die entfernten Zeilen waren eine versehentlich kopierte Deployment-Env-Stanza.

```bash
# Edit: lines 131-135 entfernen aus k3d/secrets.yaml
```

## Task 3 — GREEN + Final Verification

**target_files:** `tests/spec/ci-cd.bats`

- [ ] **GREEN:** Der T001562-Test läuft jetzt grün:

```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-ci-rot
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "T001562"
# expected: ok — alle k3d YAML-Dateien parsen sauber
```

- [ ] **Kustomize dry-run:** `task workspace:validate` (kustomize build) läuft ohne Fehler.

- [ ] **Mandatory CI-Gates:**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
