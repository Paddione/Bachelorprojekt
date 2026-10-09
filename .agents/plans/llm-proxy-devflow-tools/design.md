---
ticket_id: T901630
plan_ref: .agents/plans/llm-proxy-devflow-tools/tasks.md
status: active
date: 2026-10-09
---

# Design: llm-proxy-devflow-tools

Architektur-Spec zum Brainstorming (Chat, 2026-10-09). Normative Details stehen
in `tasks.md` + Partials; hier die getroffenen Entscheidungen.

## Entschiedene Architektur

**Proxy-Tool als MVP, MCP-Eintrag als dünner Alias danach — gleiche
Python-Funktionen.** Der llm-proxy ist bereits die harness-agnostische Schicht
(OpenAI-kompatible `/v1/*`-Routen, Tool-Schema-Sanitizing, MCP-Bridge); der
`plan-runner.mjs` für gestagte Pläne lebt daneben in `scripts/llm/`.

## Modul-Schnitt

```text
scripts/devflow/                  # Python-Backend (neu, SSOT der Logik)
  __init__.py
  cli.py                          # einziger Einstieg: python3 -m devflow <verb>
  sandbox.py                      # create/activate/destroy, .devflow/sandbox.json
  turbolint.py                    # V1: plan-lint.sh + ruff + tsc --noEmit
  instaci.py                      # liest docs/code-quality/ci-map.yaml
scripts/llm-proxy/
  devflow-tools.mjs               # Routen POST /tools/devflow/<verb>, spawnt Backend
  server.mjs                      # +2-Zeilen-Forward (Muster bge-Routen, T003205)
docs/code-quality/ci-map.yaml     # SSOT CI-Jobname -> lokales Kommando (neu)
taskfiles/Taskfile.llm.yml        # + llm:devflow:* Tasks mit Offline-Fallback
```

## Kontrakte

- CLI: Exit 0 grün · 1 Hard-Fail · 2 Umgebung (wie `plan-lint.sh`).
- HTTP: `POST /tools/devflow/turbolint|insta_ci|sandbox` mit JSON-Body
  `{worktree, scope}`; Fehler als `{error:{code,message}}` (Muster bge).
- Kein stiller Fallback: Proxy offline → Task fällt auf Direkt-Python zurück und
  meldet das sichtbar (Fail-closed-Prinzip, ADR-004).
- S4: Jedes neue Skript ist über Taskfile/Proxy-Route erreichbar (kein Orphan).

## Test-Strategie

- `scripts/llm-proxy/devflow-tools.test.mjs` mit `node --test` (Muster
  `bge-routes.test.mjs`): Routen-Dispatch, Error-Envelope, Backend-Spawning (Stub).
- pytest `tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py`:
  CLI-Verben, Sandbox-Manifest, Turbolint-Aggregation (Stub-Linter), ci-map-Parsing.
- Rot→grün-Nachweis im Tests-Partial (`expected: FAIL` + echter Runner).

## Referenzen (exploriert, A.1)

- `scripts/llm-proxy/server.mjs` (Routen-Dispatch, bge-Muster Z.274–299)
- `scripts/llm-proxy/mcp-bridge.mjs` + `scripts/llm/mcp-bridge.json` (Phase 2)
- `scripts/llm/plan-runner.mjs` (erster Consumer, ruft später pro Partial)
- `scripts/plan-lint.sh` (Gate-Logik, Exit-Codes), `taskfiles/Taskfile.llm.yml`
- ADRs: ADR-004 (fail-closed), ADR-006/007/008 (llm-proxy-Betrieb)
