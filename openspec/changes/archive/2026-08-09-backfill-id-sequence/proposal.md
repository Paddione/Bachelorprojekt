# Proposal: backfill-id-sequence

## Why

`bash scripts/ticket.sh backfill-id` bricht bei jedem Aufruf ab:

```
ERROR:  relation "tickets.ticket_id_seq" does not exist
command terminated with exit code 3
```

Das Kommando ist damit vollstaendig funktionslos. `scripts/vda/ticket/backfill-id.sh:20` liest
aus `nextval('tickets.ticket_id_seq')` — eine Sequenz, die in keiner der beiden lebenden
Ticket-Datenbanken existiert. Die tatsaechlich benutzte Quelle heisst `tickets.external_id_seq`;
so verwendet sie auch der BEFORE-INSERT-Trigger `tickets.fn_assign_external_id()`.

Der falsche Name ist ein Relikt der Umstellung aus T000402: davor speiste die Per-Brand-Tabelle
`tickets.ticket_counters` den Trigger, seitdem tut es die globale Sequenz. `ticket_id_seq` wurde
dabei nie angelegt — `backfill-id` ist der einzige Aufrufer dieses Namens im gesamten Repo.

## What

Zwei Aenderungen an `scripts/vda/ticket/backfill-id.sh`:

1. **Sequenzname korrigieren** — `tickets.ticket_id_seq` → `tickets.external_id_seq`, damit
   Trigger und Backfill dieselbe Quelle nutzen. Ein zweiter Zaehler waere auch inhaltlich falsch:
   er vergaebe IDs, die der Trigger spaeter erneut vergibt, und erzeugte damit im Kleinen genau
   die Kollision aus T002731.
2. **Leerlauf sichtbar machen** — das Kommando meldet die Trefferzahl explizit
   (`N Zeile(n) nachgetragen` bzw. `0 Zeilen ohne external_id — nichts zu tun`), Exit bleibt 0.
   Ein Lauf ohne Treffer ist kein Fehler, darf aber nicht wie geleistete Arbeit aussehen.

Dazu ein zweistufiger Test unter `tests/spec/ticket-system/backfill-id-sequence.bats`: ein
offline lauffaehiger Konsistenztest (referenzierte Sequenznamen gegen die Schema-Migration) und
ein Verhaltenstest gegen den lebenden lokalen Cluster.

_Ticket: T002732_
