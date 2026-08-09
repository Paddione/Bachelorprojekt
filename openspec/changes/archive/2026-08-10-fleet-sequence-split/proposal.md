# Proposal: fleet-sequence-split

## Why

Nach dem E3-Cutover (T002626, gemergt 2026-08-08 20:50 UTC) fuehrt die lokale Datenbank die
SDLC-Tickets. Die fleet-Kopie bleibt jedoch **beschreibbar**: `website/src/lib/projects-db.ts`
legt aus dem Produktions-Build Kundenprojekte in `tickets.tickets` an (`type='project'`, 41
Zeilen). Der dafuer vorgesehene Freeze wurde deshalb bewusst nach T002722 verschoben.

Beide Datenbanken zogen ihre `external_id` aus je einer eigenen `tickets.external_id_seq`. Da
`projects-db.ts:246` ohne `external_id` einfuegt, vergibt der Trigger dort aus **fleets**
Sequenz. Gemessen am 2026-08-08 stand fleet auf 2729, waehrend lokal T002730 bereits belegt
war — die naechste Projektanlage im Kundenportal haette also eine bereits vergebene Nummer
erneut ausgegeben. Genau diese Kollision ist in T002731 schon einmal eingetreten (zwei
verschiedene Sachverhalte unter T002727).

Als Sofortmassnahme wurde fleets Sequenz von Hand auf 900000 gesetzt; Kundenprojekte bekommen
seitdem `T900001` aufwaerts. Der Eingriff ist wirksam, aber **fluechtig**: `cmd_dump()` in
`scripts/sdlc/migrate-tickets.sh` sichert mit `pg_dump --schema=tickets` und erfasst damit auch
Sequenzen. Ein `restore` stellt den alten Stand wieder her und hebt die Trennung stillschweigend
auf — ausgerechnet im Wiederanlauf-Fall, in dem niemand daran denkt.

## What

1. **`split-sequence`-Kommando** in `scripts/sdlc/migrate-tickets.sh`: setzt fleets
   `tickets.external_id_seq` idempotent und advance-only auf den getrennten Nummernraum. Damit
   ist der Handgriff reproduzierbar statt einmalig.
2. **`restore` zieht die Trennung nach** — wer die Kopie zurueckspielt, bekommt sie nicht
   heimlich ohne Trennung zurueck.
3. **`status` zeigt die Trennung an**, damit ein Rueckfall sichtbar ist, statt bis zur naechsten
   Kollision zu warten.
4. **Test und Dokumentation**: BATS-Abdeckung fuer das neue Kommando, Ergaenzung in
   `docs/sdlc-stack/e3-cutover.md`.

Nicht Teil dieses Changes: die strukturelle Frage, ob Kundenprojekte aus `tickets.tickets`
herausgeloest werden. Das ist T002722. Dieser Change macht die Ueberbrueckung bis dahin
haltbar.

_Ticket: T002731_
