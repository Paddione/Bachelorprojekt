---
title: "ticket-mcp-update-fields-T002714 — Implementation Plan"
ticket_id: T002714
domains: [bachelorprojekt-db, bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-mcp-update-fields-T002714 — Implementation Plan

_Ticket: T002714_

Kontext und Begründung siehe `proposal.md` und `design.md`. Gewählte Richtung: Schema an die
Tool-Beschreibung anpassen (title/description patchbar machen), nicht die Beschreibung kürzen —
siehe `proposal.md` Abschnitt "Begründung".

## File Structure

```
scripts/vda/ticket/update-fields.sh                          (neu)
scripts/ticket.sh                                             (geändert: cmd_update_fields, Case, Usage)
scripts/ticket-mcp/go/internal/tools/lifecycle.go             (geändert: update_fields Schema + Handler)
tests/spec/ticket-system/update-fields-cli.bats                (bereits vorhanden — RED, siehe unten)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test wurde bereits im Plan-Stage-Commit dieses
      Vorgangs hinzugefügt (`tests/spec/ticket-system/update-fields-cli.bats`) und schlägt auf
      diesem Branch fehl, weil weder `scripts/ticket.sh update-fields` noch die
      `title`/`description`-Schema-Properties existieren.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/update-fields-cli.bats
# expected: FAIL (red — 5/5 Tests schlagen fehl: kein update-fields-Kommando, kein
# Schema-Eintrag für title/description)
```

- [ ] **Fix-Step 1 — CLI-Kommando (GREEN für Tests 1-4).**
      `scripts/vda/ticket/update-fields.sh` neu anlegen, analog zu
      `scripts/vda/ticket/update-status.sh`: `main()` liest `--id`, optional `--title`,
      `--description`. Ist weder `--title` noch `--description` gesetzt → `echo "ERROR: at
      least one of --title/--description is required." >&2; exit 2`. Sonst `_ticket_lock_guard
      "$id"`, `_pgpod`, dann `UPDATE tickets.tickets SET title = COALESCE(NULLIF(:'title', ''),
      title), description = COALESCE(NULLIF(:'description', ''), description) WHERE external_id
      = :'ext_id';` über `_exec_sql` (Muster aus `update-status.sh` übernehmen: `-v`-Parameter
      für `id`/`title`/`description`, `<<'EOF' ... EOF`-Heredoc).
      In `scripts/ticket.sh`: `cmd_update_fields()` nach dem Muster von `cmd_update_status()`
      ergänzen (`if _ticket_offline_skip "update-fields" "$@"; then exit 0; fi`, dann
      `source .../update-fields.sh; main "$@"`), im finalen `case "$cmd" in` einen
      `update-fields) cmd_update_fields "$@" ;;`-Zweig hinzufügen und `update-fields` in die
      `Commands:`-Usage-Zeile aufnehmen.

- [ ] **Fix-Step 2 — MCP-Schema (GREEN für Test 5).** In
      `scripts/ticket-mcp/go/internal/tools/lifecycle.go` beim `update_fields`-Tool
      `mcp.WithString("title", mcp.Description("Neuer Titel"))` und
      `mcp.WithString("description", mcp.Description("Neue Beschreibung"))` neben `notes`
      ergänzen. Im Handler `title`/`description` aus `a` lesen; ist eines davon nicht leer,
      `runner.RunTicket([]string{"update-fields", "--id", id, "--title", title, "--description",
      description}, map[string]string{"BRAND": brand})` aufrufen (leere Strings werden vom
      CLI-Layer als "nicht gesetzt" behandelt, s.o.). Ist zusätzlich `notes` gesetzt, danach
      weiterhin den bestehenden `add-comment`-Aufruf ausführen (zwei sequentielle
      `RunTicket`-Calls, wie in `design.md` beschrieben). Sind alle drei Felder leer, den
      bestehenden `"Keine Felder zum Aktualisieren angegeben."`-Fallback beibehalten.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/update-fields-cli.bats
# expected: PASS (5/5, grün nach Fix-Step 1 + 2)
```

- [ ] **Go-Build-Check.** `scripts/ticket-mcp/go` kompiliert weiterhin:

```bash
cd scripts/ticket-mcp/go && go build ./...
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
