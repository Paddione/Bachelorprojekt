---
title: "llm-proxy-registry-poll — Implementation Plan"
domains: [infra, testing]
status: staged
---

# llm-proxy-registry-poll — Implementation Plan

Fix für F2 aus dem Dev-DB-Audit: Registry-Poller fragt retirtes
`tickets`-Schema alle 30 s ab (5,4 % Rollback-Rate auf `website`).
Design-Entscheidung in `design.md` (Env-Bypass füllen, kein Code-Umbau).

## File Structure

Geändert:
- `dev-local/components/llm-services/deployment.yaml`: `LLM_PROXY_BACKENDS_JSON`
  als env in den mcp-node-Container (neben `MCP_NODE_SERVICES`).
- `scripts/llm-proxy/bge-routes.mjs`: Kommentar Zeile 79 auf neue Quelle
  zeigen (comment-only, keine Logik).

Referenziert, nicht geändert:
- `scripts/llm-proxy/backends.mjs`: Bypass `LLM_PROXY_BACKENDS_JSON` existiert
  bereits (Zeilen 21–23), DB-Fallback bleibt für Pfade ohne Env.

Tests:
- `tests/py/spec/llm_proxy/test_registry_no_tickets_ref.py`: RED-Test
  (Rotphase belegt, failt aktuell mit Fund in `backends.mjs` + `bge-routes.mjs`).

## S1 Budgets

Wirksame Schwellen am Branch-Bestand (alle nicht baselined; YAML ohne S1-Limit,
Präzedenz `dns-check-query-var`).

| Datei | Ist | Budget |
| --- | --- | --- |
| `dev-local/components/llm-services/deployment.yaml` | 97 | n/a (YAML), +2 Zeilen geplant |
| `scripts/llm-proxy/bge-routes.mjs` | 226 | 574 (.mjs-Limit 800) |
| `scripts/llm-proxy/backends.mjs` | 60 | keine Änderung |
| `tests/py/spec/llm_proxy/test_registry_no_tickets_ref.py` | neu (~45) | 800 (.py-Limit) |

Keine Baseline-/Ignore-Änderung. CQ02: keine TS-Änderung, any-Count steigt nicht.
Keine neuen Importzyklen (kein Code), keine Brand-Domainliterale, keine neuen
Manifeste/Skripte (S4 sauber).

## Task 1 — GREEN: Env-Bypass befüllen

- [ ] Rotphase wiederholen (expected: FAIL):
  ```bash
  python3 -m pytest tests/py/spec/llm_proxy/test_registry_no_tickets_ref.py -q
  ```
- [ ] Backend-JSON aus Migrationskette rekonstruieren
  (`scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql`,
  `2026-10-10-llm-proxy-qwen35-2b-worker.sql`,
  `2026-10-10-llm-proxy-tei-desktop-embed.sql`, abzüglich
  `2026-08-21-disable-dead-llm-proxy-backends.sql` soweit in devmesh-Datei
  nicht schon enthalten). Felder je `backends.mjs`-Typedef:
  `name, kind, baseUrl, apiKeyEnv (nur Env-NAME, kein Secret), enabled,
  priority, fixups[], modelAliases{}, maxInflight, roles[]`.
- [ ] Als einzeiliges `LLM_PROXY_BACKENDS_JSON` in `deployment.yaml`
  (mcp-node-Container-env) eintragen; JSON vorher validieren:
  ```bash
  node -e "JSON.parse(process.env.V)" -- V='<json>'
  ```
- [ ] `bge-routes.mjs:79`-Kommentar auf `LLM_PROXY_BACKENDS_JSON` umschreiben.
- [ ] GREEN-Nachweis:
  ```bash
  python3 -m pytest tests/py/spec/llm_proxy/test_registry_no_tickets_ref.py -q
  task workspace:validate
  ```
  Erwartung: Test grün, Kustomize-Dry-Run grün.

## Task 2 — Verify: Deploy + 30-min-Fenster

- [ ] `task devmesh:deploy` (lokales Mesh, kein Flux) + Rollout abwarten.
- [ ] Danach 30 min warten, dann:
  ```bash
  kubectl --context devmesh -n workspace logs deploy/shared-db -c postgres --since=30m | grep -c 'tickets.llm_proxy_backends'
  ```
  Erwartung: `0`. Gegenprobe Rollback-Delta:
  ```bash
  kubectl --context devmesh -n workspace exec deploy/shared-db -c postgres -- psql -U postgres -d website -Atc "SELECT xact_rollback FROM pg_stat_database WHERE datname='website'"
  ```
  zweimal im Abstand 10 min — Delta nahe 0 statt ~20/10 min.
- [ ] CI-Gate: `task test:changed` + `task freshness:regenerate` + `task freshness:check` + `task workspace:validate`.

## Risiken

- `superpowers:brainstorming` steht in dieser Umgebung nicht zur Verfügung;
  Entscheidung inline in `design.md` begründet, Review durch dev-flow-execute.
- JSON-Einzeiler in YAML: keine Secrets (nur Key-Namen); falls ein
  Zeilenlängen-Lint greift, auf mehrzeiligen YAML-Blockscalar ausweichen.
- `Taskfile.devmesh.yml:213`-Check fragt dieselbe gedroppte Tabelle ab —
  bewusst Follow-up, nicht Teil dieses Plans.
