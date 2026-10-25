---
title: "pxe-inference-tablet — Implementation Plan"
domains: [infra, llm, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
depends_on_plans: []
---

# pxe-inference-tablet — Implementation Plan

PK-Tablet per PXE-Profil `inference` mit Ubuntu Server minimal installieren
und als llama.cpp-Vulkan-Endpoint betreiben; Loadout austauschbar per
`task llm:tablet:apply` vom Dev-Rechner. Entscheidungen D1–D6: `design.md`.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/pxe/setup-pxe.sh` | 617 | 183 |
| `scripts/pxe/autoinstall/user-data-inference.tmpl` | neu | n/a (Vorlage) |
| `taskfiles/Taskfile.iso.yml` | 73 | n/a (YAML) |
| `docs/runbooks/workstation-cluster-pxe.md` | 193 | n/a (Markdown) |
| `docs/runbooks/pk-tablet-inference.md` | neu | n/a (Markdown) |
| `devmesh/pk-tablet/loadouts.json` | neu | n/a (JSON) |
| `devmesh/pk-tablet/models.json` | neu | n/a (JSON) |
| `devmesh/pk-tablet/llama-build` | neu | n/a |
| `scripts/llm/pk-tablet/render.mjs` | neu | 800 |
| `scripts/llm/pk-tablet/apply.sh` | neu | 800 |
| `scripts/llm/pk-tablet/run-loadout.sh` | neu | 800 |
| `scripts/llm/pk-tablet/llama-server@.service` | neu | n/a |
| `scripts/llm/pk-tablet/cpu-performance.service` | neu | n/a |
| `taskfiles/Taskfile.llm.yml` | 265 | n/a (YAML) |
| `tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py` | 80 | 720 |
| `tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py` | neu | 800 |
| `components/website/src/data/test-inventory.json` | generiert | n/a |
| `tests/evals/golden/task-list-all.txt` | generiert | n/a |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-pxe-profile.md | impl | `scripts/pxe/setup-pxe.sh`, `scripts/pxe/autoinstall/user-data-inference.tmpl`, `taskfiles/Taskfile.iso.yml`, `docs/runbooks/workstation-cluster-pxe.md`, `docs/runbooks/pk-tablet-inference.md` |  |
| p2 | tasks.d/p2-device-loadout.md | impl | `devmesh/pk-tablet/loadouts.json`, `devmesh/pk-tablet/models.json`, `devmesh/pk-tablet/llama-build`, `scripts/llm/pk-tablet/render.mjs`, `scripts/llm/pk-tablet/apply.sh`, `scripts/llm/pk-tablet/run-loadout.sh`, `scripts/llm/pk-tablet/llama-server@.service`, `scripts/llm/pk-tablet/cpu-performance.service`, `taskfiles/Taskfile.llm.yml` |  |
| p3 | tasks.d/p3-tests.md | tests | `tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py`, `tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py`, `components/website/src/data/test-inventory.json`, `tests/evals/golden/task-list-all.txt` | p1, p2 |

## Tasks

- [ ] **0. Rotphase** (`tasks.d/p3-tests.md` Task 1): Tests schreiben, `python3 -m pytest -q tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py` -> expected: FAIL.
- [ ] **1. Partial p1** (`tasks.d/p1-pxe-profile.md`): `--profile`, `--only-mac`, `--print-user-data`, Vorlage `user-data-inference.tmpl`, Task `iso:pxe:tablet`, Runbooks.
- [ ] **2. Partial p2** (`tasks.d/p2-device-loadout.md`): Geräte-Loadout, `models.json`, `render.mjs`, `apply.sh`, Units, Tasks `llm:tablet:*`.
- [ ] **3. Partial p3** (`tasks.d/p3-tests.md` Task 4): Tests grün, `task test:inventory`, `task test:evals:update`.
- [ ] **4. Finaler Verifikations-Task.** `task llm:loadouts:check`, `task iso:check`, `task test:changed`, `task freshness:regenerate`, `task freshness:check`. Keine neuen Einträge in `docs/code-quality/baseline.json`.

Hardware-Abnahme (nach Merge, manuell, Runbook `docs/runbooks/pk-tablet-inference.md`):
Installation über USB-NIC, `task llm:tablet:apply`, dann
`curl -fsS http://pk-tablet:1234/v1/models` und ein Rerank-Request über die
Kette (`192.168.100.12:8080`).
