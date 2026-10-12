---
title: "tailnet-policy-live — Implementation Plan"
ticket_id: T016528
domains: [infra, scripts, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T016515
depends_on_plans: []
---

# tailnet-policy-live — Implementation Plan

_Ticket: T016528_

Root-Cause-Analyse (Symptom vs. Ursache getrennt): Symptom (Fakt): die
Repo-Policy `devmesh/tailnet-policy.hujson` liess sich nicht einspielen, ohne
den Tailnet-Zugriff stark einzuschraenken; `tailnet-check.sh` erwartet Tags,
die live nicht existieren. Ursache (belegt per API-Export
`GET /api/v2/tailnet/-/acl`, 2026-10-12): live gilt `grants * -> *`,
devmesh-Server tragen `tag:gpu-server`, `tag:devmesh`/`tag:devclient`
fehlen in `tagOwners`, Clients (pk-desktop, pk-tablet) sind ungetaggt. Die
Repo-Fassung (T900116) wurde nie eingespielt. Operator-Vorgabe: Repo folgt Live.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `devmesh/tailnet-policy.hujson` | 40 | n/a (Policy) |
| `devmesh/inventory.yaml` | 87 | n/a (YAML) |
| `scripts/devmesh/tailnet-check.sh` | 186 | 614 |
| `scripts/cloud-env/setup.sh` | 246 | 554 |
| `tests/spec/local-dev-mesh/fixtures/inventory.yaml` | 30 | n/a (YAML) |
| `docs/runbooks/devmesh-tailnet.md` | 203 | n/a (Doku) |
| `docs/runbooks/cloud-env-devmesh.md` | 101 | n/a (Doku) |
| `docs/runbooks/devmesh-lan-dns.md` | 159 | n/a (Doku) |
| `docs/agent-guide/registry/networks.yaml` | 219 | n/a (YAML) |
| `docs/agent-guide/maps/networks-map.md` | 53 | n/a (Doku) |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_check.py` | 177 | 623 |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_policy.py` | 67 | 733 |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | `devmesh/tailnet-policy.hujson`, `devmesh/inventory.yaml`, `scripts/devmesh/tailnet-check.sh`, `scripts/cloud-env/setup.sh`, `tests/spec/local-dev-mesh/fixtures/inventory.yaml`, `docs/runbooks/devmesh-tailnet.md`, `docs/runbooks/cloud-env-devmesh.md`, `docs/runbooks/devmesh-lan-dns.md`, `docs/agent-guide/registry/networks.yaml`, `docs/agent-guide/maps/networks-map.md` |  |
| p2 | tasks.d/p2-tests.md | tests | `tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_check.py`, `tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_policy.py` | p1 |

## Tasks

- [ ] **0. Rotphase (liegt vor):** `python3 -m pytest -q tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_check.py tests/py/spec/native_ported/spec/local-dev-mesh/test_tailnet_policy.py` -> expected: FAIL (12 failed).
- [ ] **1. Partial p1** (`tasks.d/p1-impl.md`): Policy = Live-Export mit Kopfkommentar; Inventar-Tags; `tailnet-check.sh` erwartet `tag:gpu-server` bzw. keinen Tag; Doku und Kommentare.
- [ ] **2. Partial p2** (`tasks.d/p2-tests.md`): beide Dateien gruen.
- [ ] **3. Finaler Verifikations-Task.** `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
