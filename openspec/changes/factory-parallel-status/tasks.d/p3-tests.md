# P3 — Tests

Rolle: **tests** · letztes Partial · trägt den STRUCT2-Failing-Test.

Disjunkter Scope (nur diese zwei Dateien):

| `path` | Status | S1 |
|--------|--------|----|
| `website/src/lib/parallel-status.test.ts` | net-new | Test-Datei — S1-exempt (kein Budget) |
| `tests/spec/software-factory.bats` | edit (additiv) | Test-Datei — S1-exempt (nicht gebaselined trotz 3823 Zeilen) |

## Contract (Signaturen, die P1 in `website/src/lib/parallel-status.ts` exportieren MUSS)

Diese Test-Datei ist die Vertrags-Definition (TDD über Partials hinweg): P1 implementiert
`lib/parallel-status.ts` so, dass die vitest-Suite grün wird. Erwartete pure Exports:

- `deriveNextTickAt(lastTickAtISO: string | null, intervalSec: number, nowISO: string): string`
  — `lastTickAtISO` null ⇒ `nowISO + intervalSec`; sonst `lastTickAtISO + intervalSec`. Rückgabe ISO-8601.
- `deriveParallelStatus(row: { gang_tickets: number | string; slots_claimed: number | string }, slotsPerBrand: number, nextTickAt: string | null): { gangTickets: number; slotsClaimed: number; slotsPerBrand: number; nextTickAt: string | null }`
  — mappt die snake_case-Aggregatzeile (psql liefert Spalten als String) auf camelCase + numerische Koerzierung, hängt `slotsPerBrand` und `nextTickAt` an.
- `deriveCountdownSec(nextTickAtISO: string | null, nowISO: string): number`
  — verbleibende Ganzsekunden bis `nextTickAtISO`, unten bei 0 geklemmt (Grenzfall ≤ 0 ⇒ 0, „fällig"); `null` ⇒ 0.

Zeit wird immer als Argument injiziert (kein `Date.now` im Kern) → deterministisch ohne Zeit-Mocking.

---

## Task 1 — vitest gegen die pure Ableitungslogik (`parallel-status.test.ts`, net-new)

Lege `website/src/lib/parallel-status.test.ts` an. Muster: `backup-status.test.ts` (pure Funktion
direkt importieren, injizierte Zeitwerte). Kein DB-/Auth-Mock nötig — die drei Funktionen sind DB-frei.

```ts
import { describe, it, expect } from 'vitest';
import {
  deriveParallelStatus,
  deriveNextTickAt,
  deriveCountdownSec,
} from './parallel-status';

describe('deriveNextTickAt', () => {
  it('adds intervalSec to last-tick-at when present', () => {
    expect(deriveNextTickAt('2026-07-22T10:00:00Z', 300, '2026-07-22T10:02:00Z'))
      .toBe('2026-07-22T10:05:00.000Z');
  });

  it('falls back to now + intervalSec when last-tick-at is null', () => {
    expect(deriveNextTickAt(null, 300, '2026-07-22T10:00:00Z'))
      .toBe('2026-07-22T10:05:00.000Z');
  });

  it('honours a non-default interval', () => {
    expect(deriveNextTickAt('2026-07-22T10:00:00Z', 60, '2026-07-22T10:00:30Z'))
      .toBe('2026-07-22T10:01:00.000Z');
  });
});

describe('deriveParallelStatus', () => {
  it('maps a snake_case aggregate row to the camelCase status shape', () => {
    const out = deriveParallelStatus(
      { gang_tickets: 1, slots_claimed: 3 },
      3,
      '2026-07-22T10:05:00.000Z',
    );
    expect(out).toEqual({
      gangTickets: 1,
      slotsClaimed: 3,
      slotsPerBrand: 3,
      nextTickAt: '2026-07-22T10:05:00.000Z',
    });
  });

  it('coerces psql string columns to numbers', () => {
    // node-postgres returns COUNT/SUM as strings — the derive must normalise.
    const out = deriveParallelStatus(
      { gang_tickets: '0', slots_claimed: '0' },
      3,
      null,
    );
    expect(out.gangTickets).toBe(0);
    expect(out.slotsClaimed).toBe(0);
    expect(typeof out.gangTickets).toBe('number');
    expect(out.nextTickAt).toBeNull();
  });
});

describe('deriveCountdownSec (Countdown-Restzeit)', () => {
  it('returns the remaining whole seconds before the next tick', () => {
    expect(deriveCountdownSec('2026-07-22T10:05:00Z', '2026-07-22T10:02:30Z')).toBe(150);
  });

  it('clamps to 0 when the tick is already due (remaining <= 0)', () => {
    expect(deriveCountdownSec('2026-07-22T10:00:00Z', '2026-07-22T10:00:00Z')).toBe(0);
    expect(deriveCountdownSec('2026-07-22T10:00:00Z', '2026-07-22T10:01:00Z')).toBe(0);
  });

  it('returns 0 for a null nextTickAt', () => {
    expect(deriveCountdownSec(null, '2026-07-22T10:00:00Z')).toBe(0);
  });
});
```

Runner (läuft **rot**, solange P1 `lib/parallel-status.ts` noch nicht angelegt hat — Import
schlägt fehl; wird grün, sobald die drei Exports dem Contract oben entsprechen):

```bash
(cd website && pnpm vitest run src/lib/parallel-status.test.ts)
```

## Task 2 — bats STRUCT2-Failing-Test: Force-Tick-Flag-Handling in `wakeup.sh` (RED vor P1)

Additiver `@test`-Block in `tests/spec/software-factory.bats` (nächste freie Nummer: **FA-SF-73**),
eingereiht nach dem FA-SF-41-Wakeup-Block. Nutzt die vorhandene `$WAKEUP`-Datei-Variable (Z. 26).
Rein offline (Struktur-Grep, kein Cluster) — Muster wie die FA-SF-41-Struktur-Contract-Tests.

**Dies ist der `expected: FAIL`-Schritt (rot→grün-Beweis).** Vor P1 enthält `wakeup.sh` weder
`force-tick-requested` noch `last-tick-at` (verifiziert: `grep -c` liefert 0). Der Test ist damit
rot; er wird grün, sobald P1 das Flag beim Tick-Start liest + räumt und `last-tick-at` am Tick-Ende schreibt.

```bash
@test "FA-SF-73: wakeup.sh consumes and clears the force-tick-requested flag" {
  # expected: FAIL until P1 wires force-tick flag consumption into wakeup.sh.
  # RED proof: 'force-tick-requested' is absent from wakeup.sh before P1.
  run bash -n "$WAKEUP"
  [ "$status" -eq 0 ]
  # reads the control flag at tick start
  run grep -F 'force-tick-requested' "$WAKEUP"
  [ "$status" -eq 0 ]
  # clears it after reading (idempotent one-shot, not a sticky flag)
  run grep -E 'DELETE|force-tick-requested.*clear|clear.*force-tick-requested' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-73: wakeup.sh records last-tick-at into factory_control at tick end" {
  # expected: FAIL until P1 writes the last-tick-at control key.
  run grep -F 'last-tick-at' "$WAKEUP"
  [ "$status" -eq 0 ]
}
```

Runner für den Failing-Test (rot vor P1, grün nach P1):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
```

## Task 3 — bats: `slots.sh` Gang-Logik (`slot_count`/`claim-gang`, bislang ungetestet)

Weitere additive `@test`-Blöcke unter FA-SF-73, direkt nach dem FA-SF-23-Slots-Block. Offline-Assertions
laufen immer; die Live-Claim-Assertions nur mit erreichbarem Dev-Cluster (`FACTORY_CTX` gesetzt,
Guard wie FA-SF-23 Z. 704). `seed_test_feature` ist über `test_helper.bash` (setup, Z. 48) verfügbar.

```bash
@test "FA-SF-73: slots.sh claim-gang is an all-or-nothing brand-pool guard (offline)" {
  run bash -n scripts/factory/slots.sh
  [ "$status" -eq 0 ]
  # claim-gang subcommand exists
  run grep -F 'claim-gang' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
  # atomic pool check: running SUM(slot_count) + n must fit SLOTS_PER_BRAND
  run grep -F "+ :'n'::integer <= \${SLOTS_PER_BRAND}" scripts/factory/slots.sh
  [ "$status" -eq 0 ]
  # only claims a free ticket (race-free WHERE pipeline_slot IS NULL)
  run grep -F 'pipeline_slot IS NULL' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-73: count sums slot_count so a gang ticket occupies n slots (offline)" {
  run grep -F 'SUM(slot_count)' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-73: claim-gang claims n slots atomically; count reflects the gang; release resets to 1" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-gang-$$-a.txt")
  before=$(env BRAND="$brand" bash scripts/factory/slots.sh count)
  run env BRAND="$brand" bash scripts/factory/slots.sh claim-gang "$ext" 2
  [ "$status" -eq 0 ]
  after=$(env BRAND="$brand" bash scripts/factory/slots.sh count)
  [ "$after" -eq $(( before + 2 )) ]
  # second gang claim on the same ticket fails (already slotted, all-or-nothing)
  run env BRAND="$brand" bash scripts/factory/slots.sh claim-gang "$ext" 1
  [ "$status" -eq 1 ]
  run env BRAND="$brand" bash scripts/factory/slots.sh release "$ext"
  [ "$status" -eq 0 ]
  # release reset slot_count to 1 → count returns to the pre-gang baseline
  [ "$(env BRAND="$brand" bash scripts/factory/slots.sh count)" -eq "$before" ]
}

@test "FA-SF-73: claim-gang rejects a gang larger than the free pool (nothing claimed)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-gang-$$-big.txt")
  before=$(env BRAND="$brand" bash scripts/factory/slots.sh count)
  # request more slots than the brand pool (default 3) can ever hold → exit 1
  run env BRAND="$brand" bash scripts/factory/slots.sh claim-gang "$ext" 99
  [ "$status" -eq 1 ]
  # nothing was claimed: count is unchanged
  [ "$(env BRAND="$brand" bash scripts/factory/slots.sh count)" -eq "$before" ]
  env BRAND="$brand" bash scripts/factory/slots.sh release "$ext" >/dev/null || true
}
```

Runner (offline-Teilmenge läuft überall; Live-Blöcke skippen ohne `FACTORY_CTX`):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
```

## Task 4 — Test-Inventar regenerieren

Nach dem Anlegen/Ändern der Test-Dateien das committete Inventar aktualisieren, sonst schlägt der
CI-Inventar-Check fehl (`website/src/data/test-inventory.json` muss zur Suite passen):

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

## Abhängigkeiten & Reihenfolge

- Task 2 (Force-Tick-Grep) ist der STRUCT2-`expected: FAIL`-Schritt und ist **rot vor P1** —
  er wird grün, sobald P1 das Flag-Handling in `wakeup.sh` landet.
- Task 1 (vitest) ist ebenfalls rot vor P1 (Import von `lib/parallel-status.ts` fehlt) und grün,
  sobald P1 den Contract oben erfüllt.
- Task 3 (Gang-Logik) greift gegen den bereits gemergten `slots.sh` (T002074) — die Offline-Grep-Blöcke
  sind sofort grün; die Live-Blöcke laufen nur mit Dev-Cluster.
- Der finale `task test:changed` / `freshness:regenerate` / `freshness:check`-Verify (STRUCT3) steht
  im `tasks.md`-Index (Orchestrator), nicht in diesem Partial.
