---
title: "get-timeline-vestigial-brand-flag — Implementation Plan"
ticket_id: T900246
domains: [ticket-system]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# get-timeline-vestigial-brand-flag — Implementation Plan

_Ticket: T900246_

## File Structure

```
tests/spec/ticket-system/get-timeline-brand-flag-removed-T900246.bats  (new, already committed on this branch)
scripts/ticket.sh                                                       (modified, ~5 lines removed in cmd_get_timeline)
scripts/lib/ticket-help.sh                                              (modified, usage text for get-timeline)
scripts/ticket-mcp/go/internal/tools/list.go                            (modified, export_ticket_timeline call site)
scripts/ticket-mcp-node/server.mjs                                      (modified, export_ticket_timeline handler)
```

`scripts/ticket.sh` ist ~1138 Zeilen · statisches `.sh`-Limit 800 (nicht
gebaselined). Diese Änderung entfernt Zeilen aus `cmd_get_timeline` (Options-
Case, lokale Variable, psql-Bindung) und fügt keine hinzu — zeilenneutral im
negativen Sinn, kein S1-Risiko. `scripts/lib/ticket-help.sh` und die beiden
MCP-Adapter sind kleine, lokal begrenzte Edits (eine Zeile bzw. ein
Funktionsargument).

## Task 1: Root-Cause bestätigen und `--brand` end-to-end entfernen (RED → GREEN)

**Symptom vs. Ursache:** Symptom ist, dass `get-timeline --id <id> --brand
<falscher-wert>` keinen Fehler liefert, obwohl der Brand-Wert nirgends
geprüft wird. Ursache: `cmd_get_timeline` parst `--brand`/`BRAND`, defaultet
es auf `mentolder`, bindet es als psql-Variable `:'brand'` — aber seit
T900243 (die einzige `AND tp.brand = :'brand'`-Bedingung in der
`plan_events`-CTE wurde dort ersatzlos gestrichen) referenziert keine Query
diese Variable mehr.

**Entscheidung (aus dem Ticket, verifiziert, nicht neu zu verhandeln):**
`--brand` wird end-to-end entfernt, NICHT in eine Brand-Mismatch-Prüfung
umgewandelt. Beleg: `tickets.tickets.external_id` ist `TEXT UNIQUE`
(`components/website/src/lib/tickets/tables/tickets.ts:14`), vergeben über
eine einzige globale Sequenz (`tickets.external_id_seq`,
`openspec/specs/ticket-system.md:277-291`), nicht über einen
Per-Brand-Counter. Zwei Brands können also nie dieselbe `external_id`
tragen — ein `--brand`-Mismatch für ein existierendes Ticket ist ein logisch
unmögliches Szenario. `openspec/specs/ticket-system.md:1571-1578`
dokumentiert bereits, dass die Brand-Eingrenzung transitiv über den
`external_id`-Subselect erfolgt.

- [x] **Failing-Test-Step (RED).** Der Test ist bereits auf diesem Branch
      committed
      (`tests/spec/ticket-system/get-timeline-brand-flag-removed-T900246.bats`).
      Test 1 prüft: `get-timeline --id T900239` (ohne `--brand`,
      `TICKET_OFFLINE=1`) bleibt unverändert (Positiv-Anker: Exit 9,
      `OFFLINE: refused read get-timeline`); derselbe Aufruf MIT `--brand
      korczewski` soll künftig Exit 2 und `Unknown get-timeline option:
      --brand` liefern. Test 2 prüft: `get-timeline --help` dokumentiert
      weiterhin `--id`, aber nicht mehr `--brand`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/get-timeline-brand-flag-removed-T900246.bats
# expected: FAIL (red — --brand wird noch akzeptiert/dokumentiert)
```

- [x] **Fix-Step (GREEN) — `scripts/ticket.sh`.** In `cmd_get_timeline`:
      den `--brand)` Case aus der Options-Schleife entfernen, die lokale
      Default-Zuweisung `brand="${BRAND:-mentolder}"` entfernen, und die
      psql-Bindung `-v brand="$brand"` aus dem `_exec_sql`-Aufruf entfernen
      (nur `-v ext_id="$id"` bleibt). Die `plan_events`-CTE selbst bleibt
      unverändert (T900243 hat den einzigen Query-Verweis schon entfernt).

- [x] **Fix-Step (GREEN) — `scripts/lib/ticket-help.sh`.** Im
      `get-timeline)`-Block: `Usage: ticket.sh get-timeline --id
      <external_id> [--brand <brand>]` → `Usage: ticket.sh get-timeline
      --id <external_id>`, Zeile `--brand <brand>         mentolder|korczewski`
      entfernen.

- [x] **Fix-Step (GREEN) — `scripts/ticket-mcp/go/internal/tools/list.go`.**
      Im `export_ticket_timeline`-Tool-Handler (~Zeile 198): den Aufruf
      `[]string{"get-timeline", "--id", id, "--brand", brand}` zu
      `[]string{"get-timeline", "--id", id}` ändern. Der `brand`-Parameter
      des Tools selbst bleibt bestehen (andere MCP-Tools nutzen ihn weiter);
      er wird nur nicht mehr an `get-timeline` durchgereicht.

- [x] **Fix-Step (GREEN) — `scripts/ticket-mcp-node/server.mjs`.** In
      `handleToolCall`, Case `export_ticket_timeline` (~Zeile 934):
      `runTicket(['get-timeline','--id',args && args.id,'--brand',brand],
      env)` zu `runTicket(['get-timeline','--id',args && args.id], env)`
      ändern.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/get-timeline-brand-flag-removed-T900246.bats
# expected: PASS (green)
```

## Task 2: Finale Verifikation

- [x] Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
