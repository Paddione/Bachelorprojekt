# p1 — Kontextaufloesung angleichen

- In `tests/spec/ticket-system/areas-csv-trim.bats` und `tests/spec/ticket-system/backfill-id-sequence.bats`: `CTX="${FACTORY_CTX:-devmesh}"` durch
  `CTX="${TICKET_CTX:-fleet}"` ersetzen.
- Grund: `scripts/vda/ticket/_ticket-core.sh:11` loest den Kontext selbst so auf; der Test
  benutzte eine andere Variable mit anderem Default.
- Kommentar mit Verweis auf `_ticket-core.sh:11` ergaenzen (nicht nur die Zeile tauschen —
  sonst wiederholt sich der Fehler beim naechsten Default).
- Abnahme: `checks/run.sh` Invariante 3 gruen, Invariante 4 (Anker) bleibt rot.
