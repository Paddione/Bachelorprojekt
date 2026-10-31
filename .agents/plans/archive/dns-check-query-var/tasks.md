---
title: "dns-check-query-var — Implementation Plan"
ticket_id: T016522
domains: [infra, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T016515
depends_on_plans: []
---

# dns-check-query-var — Implementation Plan

_Ticket: T016522_

Root-Cause-Analyse (Symptom vs. Ursache getrennt): Symptom (Fakt): nach dem
Deploy meldete `task devmesh:dns:check` FEHLT fuer 10.10.10.2 und 10.10.10.3,
die Ausgabe zeigte `dig ... @ip PK-Desktop`; `dig @10.10.10.2 quad9.net`
antwortete korrekt. Ursache (belegt): `echo $NAME` in WSL ergibt
`PK-Desktop`; Task-Variablen werden von gleichnamigen Umgebungsvariablen
ueberschrieben, `NAME` erreichte den Default nie.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `taskfiles/Taskfile.devmesh.yml` | 174 | n/a (YAML) |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py` | 212 | 588 |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | `taskfiles/Taskfile.devmesh.yml` |  |
| p2 | tasks.d/p2-tests.md | tests | `tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py` | p1 |

## Tasks

- [ ] **0. Rotphase (liegt vor):** `python3 -m pytest -q tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py -k umgebungsvariable` -> expected: FAIL.
- [ ] **1. Partial p1** (`tasks.d/p1-impl.md`): Variable `NAME` in `dns:check` zu `QUERY` umbenennen (desc, vars, Kopfkommentar); Golden per `task test:evals:update`.
- [ ] **2. Partial p2** (`tasks.d/p2-tests.md`): Test gruen.
- [ ] **3. Finaler Verifikations-Task.** `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
