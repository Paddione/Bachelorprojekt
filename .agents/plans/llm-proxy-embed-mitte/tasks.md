---
title: "llm-proxy als Mitte für Embed/Rerank, bge-mcp als Fassade"
ticket_id: T901560
domains: [llm, embeddings, agents]
status: active
file_locks: [scripts/mcp-gateway/probe.sh, scripts/mcp-gateway/watchdog-check.sh, tests/py/spec/test_llm_proxy_embed_mitte.py, environments/dev.yaml, environments/fleet-mentolder.yaml, environments/mentolder.yaml, environments/staging.yaml, environments/korczewski.yaml, environments/fleet-korczewski.yaml, scripts/knowledge/kalibrierung-retrieval.mjs, scripts/p0min-embed-run.py, scripts/mcp/cbm-embed-sync.py, scripts/mcp/cbm-hybrid.py, docs/agent-guide/registry/mcp.yaml, docs/runbooks/studio-embed-aktivierung.md]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# llm-proxy-embed-mitte — Implementation Plan

User-Entscheidungen vom 2026-10-09: **llm-proxy `:18235` als einzige Mitte**
für Embed/Rerank, **bge-mcp als dünne MCP-Fassade** darüber, **warten-dann-
aktivieren** (Studio-Arbeit erst nach GRPO-Smoke `:8326`). Begründung,
verworfene Optionen und Prior-Art stehen in `proposal.md` im selben Ordner.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-gateway-gesundheit.md | Gateway-Gesundheit | `scripts/mcp-gateway/probe.sh`, `scripts/mcp-gateway/watchdog-check.sh` |  |
| p2 | tasks.d/p2-proxy-mitte.md | Proxy-Mitte | `environments/dev.yaml`, `environments/fleet-mentolder.yaml`, `environments/mentolder.yaml`, `environments/staging.yaml`, `environments/korczewski.yaml`, `environments/fleet-korczewski.yaml`, `scripts/knowledge/kalibrierung-retrieval.mjs`, `scripts/p0min-embed-run.py`, `scripts/mcp/cbm-embed-sync.py`, `scripts/mcp/cbm-hybrid.py`, `docs/agent-guide/registry/mcp.yaml` | p1 |
| p3 | tasks.d/p3-studio-aktivierung.md | Studio-Aktivierung | `docs/runbooks/studio-embed-aktivierung.md` | p2 |
| p4 | tasks.d/p4-tests.md | tests | `tests/py/spec/test_llm_proxy_embed_mitte.py` | p1, p2 |

Reihenfolge bindend: p1 → p2 → p3 (p3 erst nach Smoke-Ende, Smoke-Gate im
Partial); p4 trägt den RED→GREEN-Lebenszyklus der Spec (RED vor p1-Code,
GREEN nach p2). Partials teilen keine `target_files`.

## File Structure

- `scripts/mcp-gateway/probe.sh` (109 Zeilen): `PORTS` um `18235` erweitern;
  BGE-Sektion als Vorbild für die neue Proxy-Sektion (MCP-`initialize` gegen
  `:18235/mcp`? Nein — `:18235` ist **kein** MCP-Server: Health per
  `POST /v1/embeddings` mit Minimal-Payload, 200/4xx als OK, Timeout/5xx als
  FAIL; Kommentar analog `probe.sh:41-44`).
- `scripts/mcp-gateway/watchdog-check.sh` (111 Zeilen): `:18235`-Ausfall löst
  `devmesh-forward`-Neustart aus (gleiche Kette wie `:13005`, ein
  `kubectl`-Prozess trägt beide Ports).
- `tests/py/spec/test_llm_proxy_embed_mitte.py`: neu. Fälle: (a) alle
  `environments/*.yaml` setzen `LLM_EMBED_URL` und `LLM_RERANKER_URL` auf
  denselben Proxy-Basis-Host (eine Mitte, kein Split auf zwei
  Per-Rollen-Services); (b) `probe.sh` enthält `18235`;
  (c) `watchdog-check.sh` erwähnt `18235`. Stub-frei (reine Datei-Assertions,
  Vorbild `tests/spec/cbm-refresh-cron-A4.bats` für Harness-Muster).
- `environments/{dev,fleet-mentolder,mentolder,staging,korczewski,fleet-korczewski}.yaml`:
  je genau zwei Zeilen (`LLM_EMBED_URL`, `LLM_RERANKER_URL`) auf den
  Proxy-Service. Exakte Service-DNS-Namen **zur Implementierungszeit per
  `kubectl --context devmesh/fleet get svc` verifizieren** — keine Annahmen
  aus diesem Plan übernehmen.
- `scripts/knowledge/kalibrierung-retrieval.mjs:38-39`,
  `scripts/p0min-embed-run.py:26`: lokale Defaults auf `http://127.0.0.1:18235`
  (Proxy-Forward) umstellen.
- `scripts/mcp/cbm-embed-sync.py:502-506`, `scripts/mcp/cbm-hybrid.py:306`:
  Defaults auf den Proxy; `LLM_EMBED_URLS`-Fan-out bleibt erhalten (Proxy als
  erstes Glied, keine Serialisierung durch den Shim).
- `docs/agent-guide/registry/mcp.yaml`: `failover_note` von bge-mcp um einen
  Satz ergänzen (Upstream = llm-proxy-Rollen-Ketten seit diesem Change).
- `docs/runbooks/studio-embed-aktivierung.md`: neu, kurz (Smoke-Gate,
  UI-Ladeschritte, Verify-Befehle, Backend-Swap-Pointer für später).
- `components/website/src/data/test-inventory.json`: generiert, nur via
  `task test:inventory` aktualisieren.

Nicht angefasst: `scripts/bge-mcp/server.mjs` (kein Code-Change nötig —
Upstream-Wechsel erfolgt per Env `LLM_EMBED_URL`/`LLM_RERANKER_URL` der
`llm-services`-Komponente bzw. Doku; falls die Unit Env-Pins trägt, dort
nachziehen und im Partial vermerken), `components/website/src/lib/bge-router.ts`
(vertragskonform, keine Änderung).

## Quality budgets

Keine angefasste Datei trägt einen S1-Baseline-Eintrag (geprüft
2026-10-09 gegen `docs/code-quality/baseline.json`); `.yaml`/`.md`/`.bats`
haben kein statisches S1-Limit, `.sh` hat 800 (Ziel-Dateien bei 109/111
Zeilen, Zuwachs < 20 Zeilen), `.mjs`-Zuwachs < 10 Zeilen, `.py`-Defaults je
eine Zeile. S2: keine neuen TS-Imports. S3: keine Brand-Domain-Literale
(Service-DNS aus `kubectl`, nie raten). S4: Spec via `task test:inventory`
registriert; `probe.sh`/`watchdog-check.sh` bleiben über bestehende
Task-Ziele erreichbar. Keine Baseline- oder Ignore-Ausnahme.

## Tasks

- [ ] **1. p1 — Gateway-Gesundheit (RED → GREEN).**
  Siehe `tasks.d/p1-gateway-gesundheit.md`. Ergebnis: `:18235` im
  Watchdog-Raster, `:13005`-Forward repariert, Spec rot→grün.
- [ ] **2. p2 — Proxy-Mitte (URLs + Registry).**
  Siehe `tasks.d/p2-proxy-mitte.md`. Ergebnis: alle Aufrufer zeigen auf den
  Proxy, Failover-Ketten verifiziert, Registry-Doku aktuell.
- [ ] **3. p3 — Studio-Aktivierung post-Smoke (gated).**
  Siehe `tasks.d/p3-studio-aktivierung.md`. Ergebnis: Embedding geprüft,
  Qwen3.5-0.8B-Base in Studio-Inference, Runbook geschrieben. Blockiert bis
  Smoke-Ende (`ss -tln | grep 8326` leer UND Smoke-Log mit
  `GRPO_SERVER_SMOKE_OK`).
- [ ] **4. p4 — Spec-Lebenszyklus (RED → GREEN).**
  Siehe `tasks.d/p4-tests.md`. Ergebnis: Spec rot nachgewiesen, nach p2 grün.
- [ ] **5. Verify — Inventar plus alle Gates.**

  ```bash
  task test:inventory
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

  Erwartung: neue BATS-Spec grün, `bge-routes.test.mjs` grün,
  Quality-Ratchet (S1 bis S4) grün, Baseline-Key-Count unverändert.
  Zusätzlich (manuell, mit Beleg im Ticket): `start-mcp-unified.sh status`
  meldet `:18080`/`:13001`/`:13005` OK plus eine Embed/Rerank-Probe über
  `:18235`.
