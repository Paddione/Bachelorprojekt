---
title: "p3-tests — Rot/Grün und Artefakte"
domains: [testing]
status: draft
---

# pk-tablet-inference-followup — Implementation Plan

Partial p3 (Tests-Rolle). Ziel-Dateien:
`tests/py/spec/native_ported/spec/local-dev-mesh/test_pk_tablet_registry.py`,
`tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py`,
`tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py`,
`components/website/src/data/test-inventory.json`.

S1: `test_setup_pxe_guards.py` Ist 165 · nicht gebaselined · Limit 800 → Budget 635.
`test_pk_tablet_loadout.py` Ist 121 · nicht gebaselined · Limit 800 → Budget 679.
`test_pk_tablet_registry.py` Ist 97 · nicht gebaselined · Limit 800 → Budget 703.

## Task 1 — Rotphase (liegt vor, mit dem Plan committet)

```bash
python3 -m pytest -q tests/py/spec/native_ported/spec/local-dev-mesh/test_pk_tablet_registry.py tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py
```

expected: FAIL (7 failed: Service fehlt, Kettenreihenfolge, `192.168.100.12`, ufw-Zeilen,
Bootstrap-Dry-Run, Pakete).

## Task 2 — Grün + Inventar

Nach p1 und p2 derselbe Aufruf → alle grün. Dann `task test:inventory` und
`test-inventory.json` committen. Zusätzlich `task test:evals:update`, falls sich Task-Namen
ändern (hier nicht geplant).
