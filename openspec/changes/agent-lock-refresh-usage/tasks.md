---
title: "agent-lock-refresh-usage — Implementation Plan"
ticket_id: T016421
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-refresh-usage — Implementation Plan

_Ticket: T016421_

## File Structure

```
tests/spec/agent-lock-refresh-usage.bats        # NEU (RED-Regressionstest)
scripts/agent-lock.sh                           # FIX in cmd_refresh() (~Zeile 508)
openspec/changes/agent-lock-refresh-usage/      # Proposal + Delta (liegt vor)
```

## Kontext

- Defekt: `cmd_refresh() { SCOPE="$1"; … }` crasht unter `set -u`, wenn der
  Dispatcher `cmd_refresh "$@"` mit leerer Argumentliste ruft
  (`line 509: $1: unbound variable`).
- Fix-Muster steht in `cmd_claim()` (scripts/agent-lock.sh ~424):
  `SCOPE="${1:-}"; ID="${2:-}"` + bei leerem/flag-artigem Scope
  `_reject_arg refresh "$SCOPE"; return 2`.
- Koordination: T016417 toucht dieselbe Datei — Fix minimal halten,
  nichts außerhalb von `cmd_refresh` anfassen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Neue Datei
      `tests/spec/agent-lock-refresh-usage.bats`
      (Header-Konvention wie `agent-lock-fetch-guard.bats`: SSOT-
      Kommentar auf `openspec/changes/agent-lock-refresh-usage/specs/
      active-sessions-hub.md`, Ticket T016421, `AGENT_LOCK_DIR`-Override
      via `mktemp -d`). Zwei Tests:
      1. `bash scripts/agent-lock.sh refresh` → Exit 2, stderr enthält
         „refresh" und `<scope> <id>`, Lock-Dir bleibt leer.
      2. `bash scripts/agent-lock.sh refresh --ticket T000123` → Exit 2,
         keine Lock-Datei mit Namen `--ticket*`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-refresh-usage.bats
# expected: FAIL (red — cmd_refresh crasht mit unbound variable, Exit 1)
```

- [ ] **Fix-Step (GREEN).** In `cmd_refresh()` (scripts/agent-lock.sh)
      die ersten beiden Zeilen ersetzen durch:

```bash
cmd_refresh() {
  SCOPE="${1:-}"; ID="${2:-}"
  if [ -z "$SCOPE" ] || [[ "$SCOPE" == -* ]]; then
    _reject_arg refresh "$SCOPE"
    return 2
  fi
  local f; f="$(_lock_file "$SCOPE" "$ID")"
  # … Rest unverändert
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-refresh-usage.bats
# expected: PASS (green)
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich sinnvoll (Nachbar-Suite wegen gemeinsamer Datei):
`tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-session-identity.bats`
