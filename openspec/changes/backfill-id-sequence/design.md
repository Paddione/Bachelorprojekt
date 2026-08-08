# Design: backfill-id-sequence (T002732)

## Zweck

`backfill-id` traegt `external_id` fuer Ticketzeilen nach, bei denen sie fehlt. Das Kommando
scheitert seit unbekannter Zeit bei jedem Aufruf. Dieses Dokument haelt fest, was gemessen wurde,
was daraus folgt und welche Loesung gewaehlt wurde.

## Symptom vs. Hypothese (T002448-M5)

Die Trennung ist hier deshalb ausgeschrieben, weil die Ticketbeschreibung Symptom und vermutete
Ursache in einem Absatz fuehrt. Alle vier Zeilen unten wurden am 2026-08-08 gegen den lokalen
Cluster (`k3d-mentolder-dev`, ns `workspace`, DB `website`) einzeln nachgemessen.

| Aussage | Art | Beleg |
|---|---|---|
| `backfill-id` bricht mit Exit 3 ab | **Symptom** | Kommando ausgefuehrt: `ERROR: relation "tickets.ticket_id_seq" does not exist` |
| `tickets.ticket_id_seq` existiert nicht | **belegte Ursache** | `pg_class` mit `relkind='S'`, Schema `tickets`: 13 Sequenzen, keine davon `ticket_id_seq` |
| `tickets.external_id_seq` ist die richtige Quelle | **belegt** | existiert; `pg_get_functiondef(fn_assign_external_id)` enthaelt woertlich `nextval('tickets.external_id_seq')` |
| Herkunft des falschen Namens | **Hypothese, plausibel** | `migrations.ts:76-82` dokumentiert die Ablösung von `ticket_counters` durch die globale Sequenz (T000402). Dass `ticket_id_seq` dabei entstand, ist naheliegend, aber nicht aus der Historie belegt — fuer den Fix ohne Belang |

## Befund, den das Ticket nicht enthaelt

`trg_tickets_assign_external_id` ist laut `pg_get_triggerdef` ein **BEFORE INSERT**-Trigger mit
NULL-Guard (`IF NEW.external_id IS NULL THEN …`). Er vergibt also bei jedem regulaeren Insert eine
ID. Gemessen: **0 Zeilen** in `tickets.tickets` haben `external_id IS NULL`.

Daraus folgt zweierlei:

1. `backfill-id` laeuft auf einer strukturell leeren Menge. Der falsche Sequenzname ist nur der
   Grund, warum es *lautstark* scheitert statt still nichts zu tun.
2. Ein Testfall braucht eine praeparierte Zeile — siehe Teststrategie.

## Verworfene Alternativen

**Kommando ersatzlos loeschen.** Naheliegend bei 0 betroffenen Zeilen, aber falsch: T002731 hat am
selben Tag belegt, dass Zeilen am regulaeren Pfad vorbei in die Tabelle gelangen (Direktimport aus
der zweiten DB). Dort trugen sie ihre ID mit; ein Import, der sie auslaesst, ist derselbe Weg.
Genau dafuer ist `backfill-id` das Reparaturwerkzeug. Es zu entfernen, weil es heute leerlaeuft,
nimmt die Reparatur weg und laesst die Bruchstelle stehen.

**Nur den Sequenznamen korrigieren.** Erfuellt das Ticket woertlich, laesst aber offen, dass ein
Lauf mit 0 Treffern von einem erfolgreichen nicht zu unterscheiden ist: `psql` gibt bei leerem
`RETURNING` nichts aus, Exit 0. Genau dieser Fehlermodus — stiller Erfolg bei Untaetigkeit — ist
die Wurzel des Schadens in T002731. Zwei Vorgaenge desselben Musters am selben Tag sind ein
Grund, ihn hier mitzuschliessen, nicht ihn zu wiederholen.

## Gewaehlte Loesung

`scripts/vda/ticket/backfill-id.sh`:

1. Zeile 20: `tickets.ticket_id_seq` → `tickets.external_id_seq`.
2. Trefferzahl ermitteln und ausgeben. Ein Leerlauf meldet sich als solcher, Exit bleibt 0 —
   „nichts zu tun" ist ein gueltiges Ergebnis, kein Fehler.

## Teststrategie

Zwei Ebenen, weil keine allein traegt.

**Ebene 1 — Konsistenz, offline, laeuft in CI.** Jeder in `scripts/vda/ticket/*.sh` per
`nextval('tickets.…')` referenzierte Sequenzname muss in `website/src/lib/tickets/migrations.ts`
als `CREATE SEQUENCE` vorkommen. Das ist bewusst kein Muster-Grep auf eine Implementierung,
sondern ein Abgleich zweier unabhaengiger Repo-Artefakte gegeneinander — es haette den Bug beim
Einbau gefangen und faengt den naechsten dieser Art ohne lebende Datenbank.

**Ebene 2 — Verhalten, gegen den lokalen Cluster, `skip` wenn nicht erreichbar.** Fuehrt das echte
Kommando aus und prueft die zurueckgegebene `external_id` (Positiv-Anker nach T002356-M1) sowie
die Trefferzahl-Meldung. Output-Verifikation nach T002448-M4: geprueft werden `$status` und
`$output` des Kommandos, nicht der Quelltext des Skripts.

### Wie die Testzeile entsteht

Eine Zeile mit `external_id IS NULL` ist **ohne Rechte-Eskalation** erreichbar, weil der Trigger
ausschliesslich auf `BEFORE INSERT` feuert: der Test fuegt regulaer ein (Trigger vergibt eine ID)
und setzt die Spalte danach per `UPDATE` auf NULL — das laeuft am Trigger vorbei.

Damit entfaellt der Umweg ueber `session_replication_role = replica` oder
`ALTER TABLE … DISABLE TRIGGER`, die beide erhoehte Rechte in einer geteilten Datenbank
verlangten.

Eine eigene Wegwerf-Tabelle waere ebenfalls moeglich gewesen, wurde aber verworfen: `backfill-id.sh`
hat `tickets.tickets` fest verdrahtet, der Test wuerde also eine SQL-Kopie pruefen statt des
Werkzeugs — ein Verstoss gegen T002448-M4.

### Isolation und Aufraeumen

`brand` ist per `chk_brand_tickets` auf `mentolder|korczewski` beschraenkt, ein separater
Test-Brand ist unmoeglich. Der Test identifiziert seine Zeile deshalb ueber die eigene UUID und
loescht sie im `teardown` — auch wenn der Test vorher fehlschlaegt.

### In Kauf genommen

Jeder Verhaltenstest-Lauf zieht einen Wert aus `external_id_seq` und hinterlaesst eine Luecke in
der T-Nummerierung. Luecken sind unschaedlich: die `UNIQUE`-Constraint auf `external_id` schuetzt
gegen Doppelvergabe, nicht gegen Spruenge. Ein Zuruecksetzen der Sequenz waere die gefaehrlichere
Variante, weil es mit gleichzeitigen echten Inserts kollidieren koennte.

## Abgrenzung

Die Ursache aus T002731 — zwei lebende Ticket-Datenbanken mit unabhaengigen Sequenzen — wird hier
**nicht** behoben. Dieser Change korrigiert nur, aus welcher Sequenz `backfill-id` innerhalb einer
Datenbank liest.
