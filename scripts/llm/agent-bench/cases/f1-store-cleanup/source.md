# f1-store-cleanup — Quelle

Begebenheit (T900250, Change `2026-09-20-areas-csv-trim-testdata-leak`): Der
Test `areas-csv-trim.bats` legte Ticketzeilen via `ticket.sh create` an — das
loest seinen Schreibkontext ueber `${TICKET_CTX:-fleet}` auf. Der Teardown
loeschte aber ueber `${FACTORY_CTX:-devmesh}`. Zwei verschiedene Variablen mit
verschiedenen Defaults fuer denselben Begriff: Der Teardown meldete Erfolg
und traf nichts; jeder Lauf hinterliess Zeilen in der echten Ticket-SSOT.

Anfrage: Der Teardown trifft nicht, was der Test anlegt — Testdaten laufen in
die Produktions-SSOT.
Richtige Entscheidung: Eine einzige Kontext-Aufloesung (`${TICKET_CTX:-fleet}`)
fuer Schreiben wie Loeschen, plus ein Test, der nach dem Lauf direkt gegen
die Ziel-DB prueft, dass keine Zeile mit dem Testtitel uebrig ist
(Positiv-Anker statt "Teardown lief fehlerfrei").
Schiefgegangen: Nichts mehr nach dem Fix — der Fall misst, ob ein Modell die
eigentliche Ursache (gespaltene Aufloesung) statt eines Symptoms repariert.

Fixture-Abbildung: `store.sh` schreibt nach `${STORE_DIR:-/tmp/f1-store}`,
`cleanup.sh` loescht aus `${CLEANUP_DIR:-/tmp/f1-cleanup}`. Loesung: beide
ueber `${DATA_DIR:-/tmp/f1-data}` plus Rest-Waechter (fremde Dateien → Fehler).

Rot/Gruen-Nachweis (manuell, 2026-09-27): `checks/run.sh` ist gegen `base/`
rot (Exit 1: Datensaetze bleiben in /tmp/f1-store liegen, der Waechter fehlt)
und nach der Referenzloesung (beide Skripte ueber `DATA_DIR`, Waechter in
cleanup.sh) gruen (Exit 0). Detour-Variante zusaetzlich: Veraendern von
`legacy/old-cleanup.sh` faerbt rot, Unberuehrt-Lassen bleibt gruen.
