---
title: "openclaw-harness-revive — Implementation Plan"
ticket_id: T900794
domains: [agent-tooling, llm-local-dev]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openclaw-harness-revive — Implementation Plan

_Ticket: T900794_ · Vorgänger T900791 ist `done` (`shipped`) und liefert Registry,
Rollen-SSOT und Adapter-Mechanik. Design: `design.md` neben dieser Datei.

## Kontext

OpenClaw läuft als Gateway auf dem GPU-Host (Unit `openclaw-gateway.service`,
Runbook `docs/runbooks/openclaw-ops-bot.md`, Broker `scripts/openclaw-ask.sh`).
Der P1-Befund (`docs/agent-guide/registry/harness-config-targets.md`) zeigt: OpenClaw
kennt nur User-Scope (`~/.openclaw/openclaw.json`), kein Projekt-Ziel — deshalb steht
`harnesses.openclaw` in der Registry mit `config: null`, ohne Adapter und ohne eigene
Rolle (teilt sich `bp-run`). T900794 verlangt: Reaktivierung als eigene Harness mit
eigener Rolle und schmalem Werkzeugsatz (Kubernetes lesen, Logs, LLM-Tasks);
Neovim-Anbindung nur über CLI/Gateway, nie über Terminal.

## Entscheidungen aus Brainstorming (Phase A)

- D1: Neue Rolle `openclaw-ops`, eingetragen in `scripts/toolset/lib/roles.mjs`
  (`ROLES`), bewusst NICHT in `WILDCARD_ROLES` — schmaler Satz per Konstruktion
  (nur direkte Rollentreffer, wie `pi`). `check.mjs`/`sync.mjs` erben das Vokabular
  automatisch aus der SSOT; `scripts/plan-context.sh` (`_role_allowlist`) wird in
  p2 geprüft und bei Bedarf nachgezogen.
- D2: Werkzeugsatz = direkte Treffer: Kubernetes-Lesen (`mcp:mcp-kubernetes`,
  Rolle ergänzen), Logs (Teil des K8s-Lesens, kein eigener Eintrag), LLM-Tasks
  (Registry-Eintrag in p2 wählen), `ops-broker` (`cli:openclaw-ask`, Rolle ergänzen).
  Alles andere bleibt der Rolle verwehrt.
- D3: Neuer Adapter `scripts/toolset/lib/adapters/openclaw.mjs` (User-Scope:
  lesen/validieren/`doctor --probe`, kein Schreiben in CI). Exaktes Verhalten
  bestätigt der p1-Spike gegen das Gateway.
- D4: Nicht-Ziele: die Datei .opencode/agent-models.jsonc wird nicht angefasst
  (Konflikt T900792/T900793); keine Gateway-Neuinstallation (Taskfile und Unit
  existieren); keine Terminal-Neovim-Integration.
- D5: Neovim-Doku landet im Runbook (CLI plus Gateway-HTTP), siehe p4.

## S1-Budgets (Pre-flight, wirksame Schwelle)

| `path` | Ist | Restbudget |
| `scripts/toolset/lib/roles.mjs` | 42 | 758 |
| `scripts/toolset/lib/adapters/index.mjs` | 5 | 795 |
| `scripts/toolset/lib/adapters/adapters.test.mjs` | 77 | 723 |
| `scripts/plan-context.sh` | 200 | 600 |
| `docs/agent-guide/registry/capabilities.yaml` | kein S1-Limit | n/a |
| `docs/runbooks/openclaw-ops-bot.md` | kein S1-Limit | n/a |
| `docs/agent-guide/registry/harness-config-targets.md` | kein S1-Limit | n/a |
| `components/website/src/data/test-inventory.json` | generiert | n/a |

Neue Dateien (`scripts/toolset/lib/adapters/openclaw.mjs`,
`tests/spec/openclaw-harness.bats`, `.agents/plans/openclaw-harness-revive/design.md`)
werden mit Wachstumsreserve unter ihrem Extension-Limit geschnitten.

## File Structure

```
.agents/plans/openclaw-harness-revive/design.md            (neu, p1)
docs/agent-guide/registry/capabilities.yaml               (geaendert, p2)
scripts/toolset/lib/roles.mjs                            (geaendert, p2)
scripts/plan-context.sh                                  (geaendert, p2)
scripts/toolset/lib/adapters/openclaw.mjs                (neu, p3)
scripts/toolset/lib/adapters/index.mjs                   (geaendert, p3)
scripts/toolset/lib/adapters/adapters.test.mjs           (geaendert, p3)
docs/runbooks/openclaw-ops-bot.md                        (geaendert, p4)
docs/agent-guide/registry/harness-config-targets.md      (geaendert, p4)
tests/spec/openclaw-harness.bats                         (neu, p4)
components/website/src/data/test-inventory.json          (regeneriert, p4)
```

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-spike.md | impl | .agents/plans/openclaw-harness-revive/design.md |  |
| p2 | tasks.d/p2-registry.md | impl | docs/agent-guide/registry/capabilities.yaml, scripts/toolset/lib/roles.mjs, scripts/plan-context.sh | p1 |
| p3 | tasks.d/p3-adapter.md | impl | scripts/toolset/lib/adapters/openclaw.mjs, scripts/toolset/lib/adapters/index.mjs, scripts/toolset/lib/adapters/adapters.test.mjs | p1 |
| p4 | tasks.d/p4-tests.md | tests | docs/runbooks/openclaw-ops-bot.md, docs/agent-guide/registry/harness-config-targets.md, tests/spec/openclaw-harness.bats, components/website/src/data/test-inventory.json | p2,p3 |

## Verify

- [ ] **Task V: Finale Verifikation** (nach p1–p4, in dieser Reihenfolge)
  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

Commit-Policy fuer alle Partial-Commits: `chore(T900794): <subject>`.
