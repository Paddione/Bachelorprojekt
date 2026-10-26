---
title: "pk-tablet-inference-followup — Implementation Plan"
domains: [infra, llm, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
depends_on_plans: []
---

# pk-tablet-inference-followup — Implementation Plan

Nacharbeit aus der realen Inbetriebnahme von PK-Tablet (2026-10-26): fehlende Pakete im
Minimal-Image, WireGuard-Reste seit ADR-014, Tablet als Rerank-primär/Embed-Rückfall im
llm-proxy des devmesh. Symptome, belegte Ursachen und Entscheidungen D1–D6: `design.md`.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/pxe/autoinstall/user-data-inference.tmpl` | 87 | n/a (Vorlage) |
| `scripts/llm/pk-tablet/apply.sh` | 187 | 613 |
| `taskfiles/Taskfile.llm.yml` | 265 | n/a (YAML) |
| `docs/runbooks/pk-tablet-inference.md` | 146 | n/a (Markdown) |
| `dev-local/components/llm-services/tablet-endpoint.yaml` | neu | n/a (YAML) |
| `dev-local/components/llm-services/kustomization.yaml` | 6 | n/a (YAML) |
| `dev-local/components/llm-services/deployment.yaml` | 101 | n/a (YAML) |
| `scripts/llm/loadouts.json` | 527 | n/a (JSON) |
| `devmesh/inventory.yaml` | 87 | n/a (YAML) |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_pk_tablet_registry.py` | 109 | 691 |
| `tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py` | 121 | 679 |
| `tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py` | 165 | 635 |
| `tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_chain_order.py` | 58 | 742 |
| `components/website/src/data/test-inventory.json` | generiert | n/a |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-tablet-profile.md | impl | `scripts/pxe/autoinstall/user-data-inference.tmpl`, `scripts/llm/pk-tablet/apply.sh`, `docs/runbooks/pk-tablet-inference.md`, `taskfiles/Taskfile.llm.yml` |  |
| p2 | tasks.d/p2-devmesh-registry.md | impl | `dev-local/components/llm-services/tablet-endpoint.yaml`, `dev-local/components/llm-services/kustomization.yaml`, `dev-local/components/llm-services/deployment.yaml`, `scripts/llm/loadouts.json`, `devmesh/inventory.yaml` |  |
| p3 | tasks.d/p3-tests.md | tests | `tests/py/spec/native_ported/spec/local-dev-mesh/test_pk_tablet_registry.py`, `tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py`, `tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py`, `tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_chain_order.py`, `components/website/src/data/test-inventory.json` | p1, p2 |

## Tasks

- [ ] **0. Rotphase (liegt vor):** `python3 -m pytest -q tests/py/spec/native_ported/spec/local-dev-mesh/test_pk_tablet_registry.py tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py` -> expected: FAIL (7 failed).
- [ ] **1. Partial p1** (`tasks.d/p1-tablet-profile.md`): Pakete `libgomp1`/`iw` + Powersave-Regel, `apply.sh` ohne WireGuard, Runbook.
- [ ] **2. Partial p2** (`tasks.d/p2-devmesh-registry.md`): `llm-gateway-tablet`, Registry-Backends (rerank 5, embed 15), Rückfall in `loadouts.json`, Inventar.
- [ ] **3. Partial p3** (`tasks.d/p3-tests.md` Task 2): Tests grün, `task test:inventory`.
- [ ] **4. Finaler Verifikations-Task.** `task workspace:validate`, `task llm:loadouts:check`, `task test:changed`, `task freshness:regenerate`, `task freshness:check`.

Nach dem Merge (manuell): devmesh-Reconcile abwarten, dann über den Proxy
`curl -s http://<llm-proxy>/v1/rerank …` und prüfen, dass das Tablet antwortet
(`journalctl -u llama-server@bge-rerank` auf dem Tablet zeigt die Anfrage).

## Plan-Mutation (während der Umsetzung, 2026-10-26)

- p2: `tablet-endpoint.yaml` enthält zusätzlich die NetworkPolicy `allow-llm-tablet-egress`.
  Befund: `default-deny-egress` in workspace, `allow-llm-egress` öffnet nur das tote
  `192.168.100.0/24`; aus workspace `ECONNREFUSED`, aus einem Pod ohne Policy HTTP 200.
  Test: `test_llm_proxy_darf_das_tablet_erreichen`.
- p1: `taskfiles/Taskfile.llm.yml` — `tablet:bootstrap` verlangte `WG_CONF`.
- p3: `test_bge_chain_order.py` schrieb die tote Adresse `192.168.100.12:8080` fest; auf
  `100.94.91.65` umgestellt (Embed-Kette jetzt 4 Glieder).
