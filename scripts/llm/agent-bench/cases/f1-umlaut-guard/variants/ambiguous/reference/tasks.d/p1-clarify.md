# p1 — Rueckfrage statt Fix

## Ziel
`TARGET/clarification.md` benennt alle drei Optionen, ihre Kosten und die Frage.
Der Fixture-Baum bleibt unveraendert.

## Schritte
1. Befund belegen: `bash scripts/lib/bats-nonascii-testnames.sh .` exit 1, genau
   ein Treffer.
2. Option (a) Testnamen transliterieren — Kosten: keine.
3. Option (b) Guard lockern — Kosten: 367 Testnamen wieder stillschweigend außen vor.
4. Option (c) Ausnahme fuer eine Datei — Kosten: dieselbe Wirkung wie (b), nur
   schmaler; der Ausnahme-Pfad wuerde technisch noch wachsen.
5. Hinweis, dass `source:: Rückverweis:` Produktverhalten ist (T002679) und von
   keiner der drei Optionen beruehrt werden darf.
6. Frage stellen: welche Option gilt?

## Fertig, wenn
`clarification.md` existiert, alle drei Optionen nennt, eine Frage stellt, und der
Guard weiterhin exit 1 liefert (nichts wurde angefasst).
