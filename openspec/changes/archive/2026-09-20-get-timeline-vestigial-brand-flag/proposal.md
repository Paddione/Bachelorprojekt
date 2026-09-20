# Proposal: get-timeline-vestigial-brand-flag

## Why

`cmd_get_timeline` (`scripts/ticket.sh`) parst weiterhin `--brand`/`BRAND`,
defaultet es auf `mentolder` und bindet es als psql-Variable `:'brand'` —
aber seit T900243 (PR #5778, das die einzige `AND tp.brand = :'brand'`
Bedingung ersatzlos gestrichen hat) referenziert keine Query diese Variable
mehr. Ein Flag, das angenommen wird und nichts bewirkt, ist eine Falle: ein
Aufruf mit falschem `--brand` für ein existierendes `external_id` liefert
keinen Fehler und suggeriert eine Brand-Eingrenzung, die nicht stattfindet.

## What

`--brand`/`BRAND` wird aus `cmd_get_timeline` end-to-end entfernt — nicht in
eine Brand-Mismatch-Prüfung umgewandelt. Beleg für diese Richtung:
`tickets.tickets.external_id` ist `TEXT UNIQUE`
(`components/website/src/lib/tickets/tables/tickets.ts:14`) und wird über
eine einzige globale Sequenz (`tickets.external_id_seq`) vergeben, nicht über
einen Per-Brand-Counter. Zwei Brands können also niemals dieselbe
`external_id` tragen — ein `--brand`-Mismatch für ein existierendes Ticket
ist ein logisch unmögliches Szenario, keine reale Fehlerklasse, die eine
Prüfung wert wäre. `openspec/specs/ticket-system.md:1571-1578` (aus T900243)
dokumentiert bereits, dass die Brand-Eingrenzung transitiv über den
`external_id`-Subselect erfolgt.

Geänderte Stellen:
- `scripts/ticket.sh`, `cmd_get_timeline`: `--brand`-Case aus der
  Options-Schleife entfernen, lokale `brand`-Variable und die psql-Bindung
  `-v brand=...` entfernen.
- `scripts/lib/ticket-help.sh`: Usage-Text für `get-timeline` verliert
  `[--brand <brand>]`.
- `scripts/ticket-mcp/go/internal/tools/list.go`: `export_ticket_timeline`
  ruft `ticket.sh get-timeline` nicht mehr mit `--brand` auf (das Tool
  behält den `brand`-Parameter für andere Zwecke nicht — er wird beim Aufruf
  von `get-timeline` schlicht nicht mehr angehängt).
- `scripts/ticket-mcp-node/server.mjs`: `export_ticket_timeline`-Handler
  ruft `runTicket(['get-timeline', ...])` ohne `--brand` auf.

Nach der Änderung lehnt `cmd_get_timeline` ein weiterhin übergebenes
`--brand` als unbekannte Option ab (Exit 2) statt es stillschweigend zu
ignorieren — das macht verbliebene Aufrufer sichtbar, statt den Bug
fortzuschreiben.

_Ticket: T900246_
