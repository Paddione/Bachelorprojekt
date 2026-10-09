---
title: e2e-agent-auth
ticket_id: T901647
domains: [e2e, test]
status: propose
---
# e2e-agent-auth — Implementation Plan

storageState-Auth-Support im Vision-Agent-Runner: `--auth`-Flag,
Curated-Auth-Marker mit Fail-closed, Schema-Validierung in `oracle.mjs`,
Runbook-Doku. Details: `proposal.md`, `design.md`, Partials in `tasks.d/`.

## File Structure

| path | status | purpose |
|------|--------|---------|
| `tests/e2e/agent/runner.mjs` | bestehend | Auth-Flag + Context + JSONL-Feld |
| `tests/e2e/agent/oracle.mjs` | bestehend | `validateFlows`-Export |
| `tests/e2e/agent/curated.json` | bestehend | Auth-Marker an 2 Flows |
| `docs/runbooks/e2e-vision-agents.md` | bestehend | Auth-Abschnitt |
| `tests/e2e/agent/oracle.test.mjs` | bestehend | Validierungsfälle |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-runner-auth.md | impl | `tests/e2e/agent/runner.mjs`, `tests/e2e/agent/oracle.mjs` |  |
| p2 | tasks.d/p2-data-docs.md | impl | `tests/e2e/agent/curated.json`, `docs/runbooks/e2e-vision-agents.md` | p1 |
| p3 | tasks.d/p3-tests.md | tests | `tests/e2e/agent/oracle.test.mjs` | p1, p2 |

## Task 4: Finale Verifikation

- `task test:changed` — gezielte Tests für geänderte Domains
- `task freshness:regenerate` — generierte Artefakte aktualisieren
- `task freshness:check` — CI-Äquivalent (Freshness + S1–S4-Ratchet + Baseline-Assertion)
