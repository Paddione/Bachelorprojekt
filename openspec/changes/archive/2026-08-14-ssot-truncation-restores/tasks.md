---
title: Restore Harness-Stable session-identity section in active-sessions-hub SSOT
ticket_id: T005676
domains: [ops, test]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Restore Harness-Stable session-identity section in active-sessions-hub SSOT — Implementation Plan

Der 54-Batch-Archiv-Merge `9ca6710b0` (2026-08-09) ersetzte die 5-Szenario-Sektion
„Harness-Stable Session Identity for agent-lock" in `openspec/specs/active-sessions-hub.md`
durch 2 opencode-Szenarien — fünf Szenarien gingen verloren (T005676; Rekonstruktion belegt,
Pre-Stand `c5a740a47`). Dieser Change stellt die Sektion mit 7 Szenarien wieder her
(5 Pre + 2 opencode) und friert sie per BATS-Guard ein.

## File Structure

- `openspec/specs/active-sessions-hub.md` — Sektion wiederherstellen (Task 2)
- `tests/spec/active-sessions-hub/ssot-harness-stable-session.bats` — Guard (Task 1, RED)

## Task 1 — RED: Vollständigkeits-Guard schreiben und rot nachweisen

1. `tests/spec/active-sessions-hub/ssot-harness-stable-session.bats` anlegen: 7
   Szenario-Titel (5 Pre-Szenarien im Wortlaut von `c5a740a47` + 2 opencode-Szenarien) +
   Prosa-Anker (AGENT_LOCK_SID, CLAUDE_CODE_SESSION_ID, OPENCODE_SESSION_ID, _detect_tool).
   Positiv-Anker vor Negativ-Aussage (T002356-M1); Source-Grep-Prüfmodus im
   Header-Kommentar (T002448-M4-Ausnahme).
2. Rot nachweisen: `tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/ssot-harness-stable-session.bats`
   — erwartet: FAIL (`expected: FAIL`) auf dem 7-Titel-Test (5 Titel fehlen).

## Task 2 — GREEN: Sektion in openspec/specs/active-sessions-hub.md wiederherstellen

1. Die Sektion `### Requirement: Harness-Stable Session Identity for agent-lock` ersetzen
   durch den vollständigen Text aus dem Delta
   `openspec/changes/ssot-truncation-restores/specs/active-sessions-hub.md`
   (wortgleich — Prosa = aktueller Stand, 7 Szenarien). Das Folge-Requirement
   `Pre-Commit Guards in dev-flow-plan` bleibt unberührt.
2. Guard grün fahren: 3/3 PASS.

## Task 3 — Verifikation

- `task test:changed` + `task freshness:regenerate` + `task freshness:check`
- `bash scripts/openspec.sh validate ssot-truncation-restores`
