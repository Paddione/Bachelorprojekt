# p6 — tickets-transition: Grep-Muster an Re-Export-Form angleichen (T011904)

## Ziel

T007955 (Commit 3fb3cbe93, PR #4672) hat den Typ `TicketStatus` nach
`components/website/src/lib/tickets/status.ts` ausgelagert; `transition.ts:15`
re-exportiert ihn nur noch als `export type { TicketStatus };` statt der früheren
Definition `export type TicketStatus = …`. Der Test greppt nach dem alten Muster
ohne geschweifte Klammer und findet nichts.

Entscheidung (vom Ticket gefordert): **beim Grep bleiben, Muster angleichen**.
Type-Exports sind reine Compile-Zeit-Konstrukte — sie verschwinden beim
tsx-Laufzeit-Import, ein "echter Import-Test" könnte die Typ-Existenz nicht
belastbarer prüfen. Die Datei hat bereits echte Runtime-Tests, die
`transitionTicket` importieren und aufrufen und damit das Modul als ganzes
verifizieren; der statische Guard sichert gezielt den Typ-Export ab.

## Steps

1. **RED.** Testlauf auf dem aktuellen Stand:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/tickets-transition.bats
# expected: FAIL ("static: exports TicketStatus type" — grep findet den Re-Export nicht)
```

2. **GREEN.** In `tests/unit/tickets-transition.bats` (Test "static: exports
   TicketStatus type", Zeile 83-86) das Grep-Muster angleichen:

```bash
grep -q 'export type { TicketStatus }' \
  "${PROJECT_DIR}/components/website/src/lib/tickets/transition.ts"
```

   Hinweis: `export type { TicketResolution }` und `export interface
   TransitionResult` sind weiterhin direkte Definitionen in transition.ts — die
   benachbarten Tests bleiben unverändert.

3. **Verifikation.** Zusätzlich die Runtime-Tests der Datei laufen lassen
   (skippen ohne DB, aber der Import-Pfad des Moduls wird geladen):

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/tickets-transition.bats
```

## Acceptance

- Der statische Export-Test ist grün und assertiert die Re-Export-Form.
- Die benachbarten Static- und Runtime-Tests bleiben unverändert grün.
- Kein Produktcode geändert.
