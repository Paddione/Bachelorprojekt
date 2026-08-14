# p2 — TS-Guard-Spiegelung in transition.ts (T003072)

## Ziel

`website/src/lib/tickets/transition.ts` spiegelt den Terminal-Guard (T002382-M3)
und muss dieselbe Reparatur-Ausnahme anwenden, damit beide Write-Pfade einig
bleiben (T002230-Muster).

## Steps

1. **RED.** Der BATS-Test 2 (transition.ts) schlägt fehl — die Ausnahme fehlt
   im TS-Pfad. `expected: FAIL`.

2. **GREEN.** In `website/src/lib/tickets/transition.ts`:
   - FOR-UPDATE-SELECT um `resolution, created_at, updated_at` erweitern.
   - Vor dem `b4 === 'done'`-Throw die Ausnahme auswerten:
     ```ts
     const invalidDone =
       b4 === 'done' &&
       before.resolution == null &&
       before.created_at instanceof Date &&
       before.created_at.getTime() === before.updated_at.getTime();
     ```
     Throw-Bedingung um `&& !invalidDone` ergänzen.
   - `archived`-Guard und der resolution-erhaltende UPDATE bleiben unverändert.
   - Bestehende Unit-Tests (`website/src/lib/tickets/transition.test.ts`)
     grün halten; falls vorhandene done-Guard-Testfälle die neue Ausnahme
     abdecken müssen, dort einen Fall für ungültiges done ergänzen.

3. **Verifikation.** `(cd website && npx vitest run src/lib/tickets/transition.test.ts)`
   grün; BATS-Filter T003072-Test 2 grün.

## Acceptance

- Ungültiges done (resolution null + created_at == updated_at) → kein Throw.
- Gültiges done → Throw mit unveränderter Meldung.
- archived-Verhalten unverändert.
