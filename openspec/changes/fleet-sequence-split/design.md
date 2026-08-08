# Design: fleet-sequence-split (T002731)

## Symptom vs. Hypothese (T002448-M5)

Alle Zeilen am 2026-08-08 gegen die lebenden Datenbanken gemessen.

| Aussage | Art | Beleg |
|---|---|---|
| Zwei Sachverhalte trugen T002727 | **Symptom** | in T002731 dokumentiert, bereinigt |
| Beide DBs haben je eine eigene `external_id_seq` | **belegt** | `pg_class`, beide Kontexte |
| fleet stand auf 2729, lokal war T002730 belegt | **belegt** | `last_value` je DB, `SELECT title` lokal |
| Das Kundenportal zieht aus fleets Sequenz | **belegt** | `projects-db.ts:246` fuegt ohne `external_id` ein, Trigger `fn_assign_external_id` vergibt |
| Ausloeser war der unvollstaendige E3-Cutover | **belegt** | `ticket_activity._created`: 19:02 / 19:17 (vor Merge 20:50 UTC) und 20:55 (danach) |
| Ein `restore` hebt die Trennung auf | **belegt durch Code-Lesung** | `cmd_dump()` nutzt `pg_dump --schema=tickets`, das Sequenzen einschliesst |

Ausgeschlossen: der GitHub-Poller aus T002626 (`factory/lib.sh:21` zeigt auf lokal) und
`ticket-mcp-go` (reiner Wrapper um `ticket.sh`, setzt `TICKET_CTX` nie).

## Warum Nummernraum und nicht Berechtigung

Die naheliegende Loesung — fleet schreibgeschuetzt — ist nicht verfuegbar. `cmd_freeze()`
(`migrate-tickets.sh:414`) arbeitet tabellen-granular: `REVOKE … ON ALL TABLES IN SCHEMA
tickets`, danach `GRANT` zurueck fuer die Tabellen in `$KEEP_ON_FLEET`. Eine Freigabe nur fuer
`type='project'` **innerhalb** derselben Tabelle laesst sich so nicht ausdruecken. Genau daran
scheiterte der Freeze in E3, und deshalb liegt er bei T002722.

Der Nummernraum ist der Angriffspunkt, der ohne diese Entscheidung auskommt: Kundenprojekte
brauchen keine T-Nummer aus der SDLC-Sequenz. Sind die Raeume getrennt, ist die Kollision
strukturell unmoeglich — unabhaengig davon, wie T002722 spaeter ausgeht.

Gewaehlt: **900000**. Bereich in beiden DBs unbelegt (je 0 Zeilen ueber `T900000`), und
`LPAD(n,6,'0')` bleibt bis 999999 sechsstellig — das ID-Format `^T[0-9]{6}$` bricht also nicht.
Ein hoeherer Startwert haette diese Grenze gerissen.

## Warum das ins Skript gehoert

Der Handgriff ist bereits ausgefuehrt und wirkt. Zwei Wege koennten ihn aufheben:

- **Schema-Init:** kann es nicht. Der Reseed in `migrations.ts:164-173` ist advance-only
  (`GREATEST(max, last_value)`, T001392) und senkt `last_value` nie.
- **Restore:** kann es. `pg_dump --schema=tickets` sichert Sequenzen mit, ein Ruecklauf setzt
  den alten Stand. Das trifft ausgerechnet den Wiederanlauf nach einem Zwischenfall, in dem an
  die Trennung niemand denkt.

Deshalb drei Bausteine statt eines Einzeilers: ein idempotentes Kommando, ein `restore`, das
die Trennung nachzieht, und ein `status`, der ihren Verlust sichtbar macht.

## Verworfen

**Nur dokumentieren.** Eine Notiz im Runbook haelt keinen Restore auf. Die Trennung ist
Zustand, nicht Wissen.

**Trigger-Guard in fleet statt Nummernraum** (INSERT ablehnen, wenn `type <> 'project'`). Wuerde
ein vergessenes `TICKET_CTX=fleet` hart abweisen — was der urspruenglichen Absicht entspricht —
aber die Nummernkollision der Projekt-Tickets **nicht** loesen; die entstuende weiterhin. Als
Ergaenzung sinnvoll, als Ersatz nicht. Gehoert zur Entscheidung in T002722.

**Sequenz nach jedem Insert abgleichen.** Verlagert die Kopplung in den heissen Pfad und macht
zwei Datenbanken voneinander abhaengig, die gerade entkoppelt werden sollen.

## Abgrenzung

Kundenprojekte und SDLC-Tickets teilen sich weiterhin `tickets.tickets`. Dieser Change wirkt auf
den Nummernraum, nicht auf die Struktur. Die strukturelle Entscheidung ist und bleibt T002722;
dieser Change macht die Zeit bis dahin haltbar.

## Hinweis fuer das Archivieren

`openspec/specs/sdlc-isolation.md` existiert noch nicht — die Delta-Spec traegt den
Parent-Slug, aber der SSOT-Spec ist bisher nicht angelegt. Beim Abschluss deshalb
`scripts/openspec.sh archive fleet-sequence-split --create-new`; ohne das Flag bricht der
Archivlauf ab.
