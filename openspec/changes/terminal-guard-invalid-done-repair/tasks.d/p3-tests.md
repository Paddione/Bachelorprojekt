# p3 — Tests: BATS-Verifikation + Delta-Spec (T003072)

## Ziel

Der RED-BATS-Block aus der Planphase (bereits auf dem Branch) ist der
strukturelle Nachweis; dieses Partial verifiziert die Gesamtstrecke und hält
die Delta-Spec konsistent.

## Steps

1. **RED.** Vor p1/p2 sind die beiden T003072-Tests rot (bereits belegt).
   `expected: FAIL`.

2. **GREEN.** Nach p1/p2:
   - `tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats` komplett
     grün (inkl. aller bestehenden T002382-M1/M2/M3- und T002876-Tests).
   - Delta-Spec `specs/mcp-gateway.md` gegen `scripts/openspec.sh validate`
     validieren (MODIFIED-Format, Szenarien vollständig).

3. **Verifikation.** End-to-End-Smoke (freiwillig, ohne DB-Mutation): ein
   Test-Fixture-Ticket (is_test_data) per SQL auf den ungültigen done-Zustand
   setzen und `ticket.sh update-status` reparieren — dokumentiert, dass der
   sanktionierte Pfad wieder funktioniert. (Nur lokal, wird nicht committed.)

## Acceptance

- Beide T003072-BATS-Tests grün; kein bestehender Guard-Test rot.
- Delta-Spec valide (openspec validate).
- Beide Write-Pfade dokumentiert einig (Shell + TS).
