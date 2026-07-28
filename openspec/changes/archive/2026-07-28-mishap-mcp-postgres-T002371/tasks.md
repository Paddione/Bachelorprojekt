---
title: "mishap-mcp-postgres-T002371 — Implementation Plan"
ticket_id: T002371
domains: [infra, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-mcp-postgres-T002371 — Implementation Plan

_Ticket: T002371_

Mishap-Bundle mit einem Eintrag: Port-Forward zu `workspace/shared-db` liefert korrupte Daten
(falsche `external_id`). Das MCP-Read-Tool `mcp__mcp-postgres__query` gab T002358 statt
T002367 zurück, woraufhin das UPDATE-Flag auf eine nicht existierende ID gesetzt wurde.

Vier Maßnahmen:

1. **Read-Integritäts-Guard** (`scripts/verify-ticket-id.sh`) — neues Skript, prüft
   `external_id`-Existenz via `kubectl exec` (sicher) vor writes, die auf einem Port-Forward-Read
   basieren.
2. **mcp-tool-guide.md aktualisieren** — die "Gegenprüfung"-Regel mit konkreter Skript-Referenz
   versehen.
3. **ticket-attach.sh `--field-selector` nachrüsten** — die Pod-Selektion filtert noch nicht
   auf `status.phase=Running` (identischer Bug wie T002386).
4. **Status-Transition-Guard** (`update-status.sh`) — Heredoc statt `-c`-Flag, plus
   Terminal→Nicht-Terminal-Sperre.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `scripts/verify-ticket-id.sh` existiert noch nicht → jeder
      Aufruf ab Exit 127. Ebenso fehlt `--field-selector` in `scripts/ticket-attach.sh:34` →
      existierende Grep-Assertion aus `tests/spec/software-factory.bats` schlägt fehl.

      ```bash
      # verify-ticket-id.sh existence
      test -f scripts/verify-ticket-id.sh && echo "EXISTS" || { echo "MISSING"; exit 1; }

      # ticket-attach.sh field-selector grep
      grep -Fq '--field-selector status.phase=Running' scripts/ticket-attach.sh || \
        { echo "MISSING field-selector in ticket-attach.sh"; exit 1; }

      # update-status.sh heredoc
      grep -Fq "SELECT status FROM tickets.tickets WHERE external_id = :'ext_id'" \
        scripts/vda/ticket/update-status.sh || \
        { echo "MISSING heredoc status guard in update-status.sh"; exit 1; }

      # mcp-tool-guide.md verify-ticket-id reference
      grep -Fq 'verify-ticket-id.sh' .claude/skills/references/mcp-tool-guide.md || \
        { echo "MISSING verify-ticket-id reference in mcp-tool-guide.md"; exit 1; }
      ```

- [x] **Fix-Step M1 (GREEN) — `scripts/verify-ticket-id.sh` anlegen.** Neues Skript mit
      `set -euo pipefail`, `kubectl get pod --field-selector status.phase=Running` für die
      Pod-Selektion (identisch zu `_pgpod`/`factory_pgpod`) und `kubectl exec … psql` für den
      Verifikations-Read. Exit 0 = Ticket existiert, Exit 1 = nicht gefunden (Write-Abbruch),
      Exit 2 = Infrastruktur-Fehler (kein Pod).

      ```bash
      cat > scripts/verify-ticket-id.sh << 'SCRIPT'
      #!/usr/bin/env bash
      # verify-ticket-id.sh — Port-Forward-Read-Integrity-Guard
      set -euo pipefail
      EXT_ID="${1:?Usage: verify-ticket-id.sh <external_id> [brand]}"
      BRAND="${2:-mentolder}"
      NS="workspace"
      CTX="fleet"
      POD=$(kubectl get pod -n "$NS" --context "$CTX" -l app=shared-db \
        --field-selector status.phase=Running -o name 2>/dev/null | head -1)
      [[ -z "$POD" ]] && { echo "verify-ticket-id: ERROR — kein shared-db Pod" >&2; exit 2; }
      UUID=$(kubectl exec "$POD" -n "$NS" --context "$CTX" -c postgres -- \
        psql -U website -d website -qtA -v ON_ERROR_STOP=1 \
        -v eid="$EXT_ID" -v brand="$BRAND" \
        -c "SELECT uuid::text FROM tickets.tickets WHERE external_id = :'eid' LIMIT 1;" 2>/dev/null)
      [[ -z "$UUID" ]] && { echo "verify-ticket-id: REJECTED — Ticket $EXT_ID ($BRAND) nicht gefunden" >&2; exit 1; }
      echo "verify-ticket-id: OK — $EXT_ID → $UUID"
      SCRIPT
      chmod +x scripts/verify-ticket-id.sh
      ```

- [x] **Fix-Step M2 (GREEN) — `mcp-tool-guide.md` aktualisieren.** In der Port-Forward-Integrität-
      Sektion die Zeile "Kein Skript-Fix möglich: die Ursache liegt in der Port-Forward-Session"
      durch die `verify-ticket-id.sh`-Referenz ersetzen.

- [x] **Fix-Step M3 (GREEN) — `ticket-attach.sh` `--field-selector` nachrüsten.** In Zeile 34
      das `kubectl get pod` um `--field-selector status.phase=Running` ergänzen.

      ```bash
      # Vorher:
      PGPOD=$(kubectl get pod -n "$NS" --context "$CTX" -l app=shared-db -o name 2>/dev/null | head -1)
      # Nachher:
      PGPOD=$(kubectl get pod -n "$NS" --context "$CTX" -l app=shared-db \
        --field-selector status.phase=Running -o name 2>/dev/null | head -1)
      ```

- [x] **Fix-Step M4 (GREEN) — `update-status.sh` Heredoc + Terminal-Guard.** Den bestehenden
      `_exec_sql`-Aufruf mit `-c`-Flag durch einen Heredoc ersetzen, der den Status mittels
      `SELECT status FROM tickets.tickets WHERE external_id = :'ext_id'` liest. Danach eine
      `case`-Prüfung: `done:*` (außer `done:archived` und `done:done`) → exit 2, `archived:*`
      (außer `archived:archived`) → exit 2.

- [ ] **Final Verification.** Run:

      ```bash
      test -f scripts/verify-ticket-id.sh
      grep -Fq 'verify-ticket-id.sh' .claude/skills/references/mcp-tool-guide.md
      grep -Fq '--field-selector status.phase=Running' scripts/ticket-attach.sh
      grep -Fq "SELECT status FROM tickets.tickets WHERE external_id = :'ext_id'" \
        scripts/vda/ticket/update-status.sh
      grep -Fq "Cannot transition from 'done'" scripts/vda/ticket/update-status.sh
      ```
