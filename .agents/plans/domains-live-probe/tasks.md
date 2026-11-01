---
title: "domains-live-probe — Live-Host-E2E-Probe für die Frontend-Domain-SSOT (Goal-Kriterium 4)"
domains: [infra, website]
status: active
goal: frontend-domain-ssot
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# domains-live-probe — Implementation Plan

Zweck (Deutsch): Kriterium 4 des Goals `frontend-domain-ssot` erfüllen — ein
E2E-Lauf (nächtlich und auf Abruf), der je live Host aus
`docs/agent-guide/registry/domains.yaml` DNS, TLS-Gültigkeit, den erwarteten
Status bzw. Redirect und das erreichte Ziel prüft. Abweichung lässt den Lauf
fehlschlagen; ein grüner Lauf ist mit Befehl und Ausgabe belegt.

Brainstorming-Entscheidungen (2026-11-01, mit Eigner abgestimmt):
- **B1 Erwartungen in `domains.yaml`**: je live Eintrag ein `expect`-Block
  (`status: [...]`, optional `redirect_to_contains`), kein separates
  Probe-Config-File — die Registry bleibt der einzige SSOT.
- **B2 Platzhalter aus Env-Dateien**: `${VAR}` im `host` wird pro Cluster aus
  einer festen Env-Datei aufgelöst (`fleet` → `environments/fleet-mentolder.yaml`,
  `devmesh` → `environments/dev.yaml`, jeweils `env_vars:`-Sektion).
  Unauflösbar → fail-closed (Exit ≠ 0). Keine impliziten Defaults.
- **B3 Hybrid-Semantik**: `fleet` immer fail-closed. `devmesh`-Hosts, deren DNS
  vom Läufer aus nicht auflösbar ist (CI-Runner haben kein Tailnet), werden als
  SKIP mit Grund gemeldet statt zu failen; jede andere Abweichung failt.
  Unauthentifizierte Probe ist Absicht: Die Erwartungswerte sind die
  No-Auth-Antworten (200 offen / 302→SSO / 401 / 301), daher keine Credentials.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/domains-probe.mjs` | 0 (neu) | 800 (.mjs-Limit 800, Plan ≈ 300) |
| `tests/py/spec/remaining_root_specs/domain_registry/test_domains_probe.py` | 0 (neu) | 800 (.py-Limit 800, Plan ≈ 150) |
| `docs/agent-guide/registry/domains.yaml` | 264 | n/a (`.yaml` ungated; Plan ≈ +60 `expect`-Blöcke) |
| `scripts/domains-check.mjs` | 332 | 800 (.mjs-Limit 800, Plan ≈ +30 Expect-Pflicht-Validierung) |
| `taskfiles/Taskfile.platform.yml` | 809 | n/a (`.yml` ungated; Plan +8 `domains:probe`-Task) |
| `.github/workflows/domains-probe.yml` | 0 (neu) | n/a (`.yml` ungated, Plan ≈ 60) |
| `tests/evals/golden/task-list-all.txt` | generiert | +1 Zeile via `task test:evals:update` |
| `components/website/src/data/test-inventory.json` | generiert | +1 Eintrag via `task test:inventory` |

Verbraucht: `docs/agent-guide/registry/domains.yaml` (Registry + Expect-Schema),
`environments/fleet-mentolder.yaml` + `environments/dev.yaml` (Platzhalter-Quellen),
`.github/workflows/e2e.yml` (Vorbild Cron `0 3 * * *` + `workflow_dispatch`-Muster).
Produziert: Probe-Log + Exit-Code (nächtlich per Workflow, lokal per Task).
S4: Script, Task und Workflow sind jeweils voneinander aus erreichbar
(`task domains:probe` ruft das Script; der Workflow ruft den Task-Befehlspfad
`node scripts/domains-probe.mjs` direkt, ohne Task-Abhängigkeit im Runner).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-probe-script.md | impl | `scripts/domains-probe.mjs` |  |
| p2 | tasks.d/p2-expect-schema.md | impl | `docs/agent-guide/registry/domains.yaml`, `scripts/domains-check.mjs` | p1 |
| p3 | tasks.d/p3-task-workflow.md | impl | `taskfiles/Taskfile.platform.yml`, `.github/workflows/domains-probe.yml` | p1 |
| p4 | tasks.d/p4-tests-evidence.md | tests | `tests/py/spec/remaining_root_specs/domain_registry/test_domains_probe.py`, `tests/evals/golden/task-list-all.txt`, `components/website/src/data/test-inventory.json` | p1, p2, p3 |

## Tasks

- [x] **0. Rotphase zuerst:** `test_domains_probe.py` aus p4 vorab schreiben und
  laufen lassen → expected FAIL (`domains-probe.mjs` fehlt: `test_validate_only_passes`
  mit Exit ≠ 0 wegen fehlendem Script; Beleg im phase-events.log).
- [x] **1. Partial p1** (`tasks.d/p1-probe-script.md`): Probe-Script bauen
  (DNS → TLS → Status/Redirect, Hybrid-Semantik, `--validate-only`).
- [x] **2. Partial p2** (`tasks.d/p2-expect-schema.md`): `expect`-Blöcke für alle
  18 live Einträge (Startwerte Live-Proben 2026-10-28, per Live-Lauf verifiziert)
  + Expect-Pflicht in `domains-check.mjs`.
- [x] **3. Partial p3** (`tasks.d/p3-task-workflow.md`): `task domains:probe` +
  `.github/workflows/domains-probe.yml` (Cron + Dispatch).
- [x] **4. Partial p4** (`tasks.d/p4-tests-evidence.md`): Offline-Tests grün,
  Golden + Inventory regeneriert, **Live-Beleg**: `task domains:probe`-Voll-Lauf
  ab Tailnet-Host, Ausgabe in den PR-Body.
- [x] **5. Finaler Verifikations-Task.** `task test:changed`,
  `task freshness:regenerate`, `task freshness:check`, `task workspace:validate`.
