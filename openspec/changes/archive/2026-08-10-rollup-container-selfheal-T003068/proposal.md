# Proposal: rollup-container-selfheal-T003068

## Why

`bash scripts/ticket.sh rollup-container --brand mentolder` schlägt mit Exit 1 und ohne jede
Ausgabe fehl, sobald kein offener Rollup-Container existiert. Damit schlägt auch jeder
`report_mishap`-Aufruf über `ticket-mcp` fehl ("Rollup-Container-Auflösung fehlgeschlagen:
ticket.sh failed (exit code 1)") — der gesamte Mishap-Meldeweg ist blockiert, sobald der
Container geschlossen oder in einer zweiten Ticket-DB noch keiner angelegt ist.

## Root-Cause (verifiziert, kein Hypothese)

`scripts/ticket.sh:22` setzt `set -euo pipefail`. In `cmd_rollup_container` (Zeile 989-1023)
lautet die Suchzeile:

```bash
ext_id=$(_exec_sql "$pod" -c "SELECT ..." 2>/dev/null | grep -v '^$' | head -1)
```

Liefert die Query kein Ergebnis, gibt `grep -v` Exit 1 zurück. Unter `pipefail` fällt der
Exit-Code der gesamten Pipeline auf 1, und `set -e` bricht die Funktion ab — BEVOR Step 2
("kein offener Container, lege neuen an") erreicht wird.

Minimaler Reproducer (bewiesen):

```bash
bash -c 'set -euo pipefail; x=$(printf "" | grep -v "^$" | head -1); echo erreicht'
# EXIT=1, "erreicht" wird nie ausgegeben.
```

Abgrenzung: `_pgpod` und `_exec_sql` funktionieren beide korrekt (EXIT=0). Der Defekt liegt
ausschließlich in der Fehlerbehandlung der Suchzeile in `cmd_rollup_container`.

## Was

Die Suchzeile gegen den Leerfall absichern (`|| true` an das Ende der Pipeline), damit eine
leere Trefferliste die Funktion nicht mehr unter `pipefail` abbricht, sondern Step 2
(Anlegen eines neuen Rollup-Containers) tatsächlich erreicht wird.

Randbedingung: T003067 ist der aktuell einzige offene kanonische Rollup-Container und darf
durch diese Arbeit nicht geschlossen oder verändert werden.

## Nicht-Ziele

- Keine Änderung an der Suchlogik selbst (Titel, Status-Filter, Sortierung) — nur die
  Fehlerbehandlung der Pipeline.
- Keine Änderung an `scripts/factory/mishap-rollup.sh` oder `migrate-mishap-bundles.sh` (haben
  eigene `ROLLUP_TITLE`-Definitionen, sind aber nicht vom `pipefail`-Defekt betroffen, weil sie
  `cmd_rollup_container` nicht selbst reimplementieren).
