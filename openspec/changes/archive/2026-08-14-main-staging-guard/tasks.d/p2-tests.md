# p2 — Tests: BATS-Verifikation + Delta-Spec (T003980)

## Ziel

Der RED-BATS-Block (bereits auf dem Branch) ist der strukturelle Nachweis;
dieses Partial verifiziert die Gesamtstrecke und validiert die Delta-Spec.

## Steps

1. **RED.** Vor p1 sind die drei T003980-Tests rot (bereits belegt).
   `expected: FAIL`.

2. **GREEN.** Nach p1:
   - `tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/` komplett
     grün (inkl. half-archive-guard.bats — keine Regression am Nachbar-Guard).
   - Delta-Spec `specs/openspec-workflow.md` gegen `scripts/openspec.sh
     validate` validieren (ADDED-Format, alle Szenarien mit GIVEN/WHEN/THEN).

3. **Verifikation.** End-to-End-Smoke im Hauptcheckout (ohne Mutation): ein
   temporärer ungetrackter `openspec/changes/dummy-guard-smoke/` + `git add`
   → `git commit` scheitert mit der Guard-Meldung; `SKIP_MAIN_STAGING_GUARD=1
   git commit` läuft durch. Dummy-Verzeichnis danach entfernen (nichts wird
   committed).

## Acceptance

- Alle T003980-BATS-Tests grün; half-archive-Guard unberührt grün.
- Delta-Spec valide (openspec validate).
- Smoke belegt Block + Bypass.
