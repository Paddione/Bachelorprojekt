---
ticket_id: T005591
plan_ref: openspec/changes/sf-fixture-hardening/tasks.md
status: active
date: 2026-08-14
---

# Design: SF-TEST-Fixture-Härtung (Review PR #4447)

## Root-Cause

Post-Merge-Review von PR #4447 (T005309) lieferte 6 Härtungsbefunde; der Kern: **Exec-Fehler werden still zu „row missing" konflationiert** — schlägt der kubectl-exec/psql in `purge_real_feature` fehl, ist `title` leer und die Funktion returnt 0, identisch zur Idempotenz-Antwort. Ein transienter kubectl-Fehler hinterlässt einen Ghost-Seed ohne Spur (rot verifiziert: fake-kubectl mit exec-Failure → rc=0).

## Umfang (Befunde 1–5 aus dem Review)

1. **Exec-Observability [Important]:** `tests/lib/factory-test-fixtures.sh` SELECT/exec: Exit-Code des exec prüfen (`PIPESTATUS` bzw. direkt `rc=$?`), bei Fehler `return 1` + stderr-Log. `_sf_teardown` (`tests/spec/software-factory/_sf_common.bash:131`) verwirft stderr nicht mehr (Log statt `/dev/null`), bleibt via `|| true` exit-neutral.
2. **Skip-Maskierung [Minor, T003548-adjacent]:** `tests/spec/software-factory/scheduling-cleanup-guard.bats:70` — `[ -n "$created" ] || skip` greift auch bei erreichbarer DB; ein kaputter create-Pfad macht den Guard grün-by-skip. Umstellen: bei erreichbarer DB `fail`, skip nur bei verifiziert offline.
3. **Kontrakt-Präzision [Minor]:** Guard-Test 3 assertet `-ne 0` statt des dokumentierten Exit 4; der `--force`-Pfad prüft Exit 0, aber nicht, dass die Zeile wirklich gelöscht ist. Beides nachschärfen.
4. **`< /dev/null`-Konsistenz [Minor]:** `ensure_purge_fn_current` (Z. 123) und `purge_factory_test_data` (Z. 161) erhalten `< /dev/null`; Z. 128 (`psql < "$latest"`) bleibt bewusst unverändert (liest aus stdin).
5. **Brand-Mismatch-Kommentar [Minor]:** Guard-Test 1 seedet mentolder, `_sf_teardown` purgt mit `${TEST_BRAND:-korczewski}` — harmlos (DELETE filtert auf external_id), aber ein Kommentar dokumentiert die Archäologie.

Befund 6 (SQL-Interpolation der ext_id): bewusst NICHT geändert — pre-existing Stil, tool-generierte T-Nummern, kein realistischer Vektor; das `-v`-Binding-Muster bleibt der bevorzugte Stil für Neucode (nur Kommentar).

## Teststrategie

Failing Test `tests/spec/software-factory/sf-fixture-observability.bats` (rot verifiziert): fake-kubectl mit exec-Failure → `purge_real_feature "mentolder" "T999999"` muss rc≠0 liefern + stderr-Beleg. Grün nach Befund 1.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `tests/lib/factory-test-fixtures.sh` | Befunde 1, 4 |
| `tests/spec/software-factory/_sf_common.bash` | Befund 1 (stderr-Log) |
| `tests/spec/software-factory/scheduling-cleanup-guard.bats` | Befunde 2, 3, 5 |
| `tests/spec/software-factory/sf-fixture-observability.bats` | neu (rot) |
| `openspec/changes/sf-fixture-hardening/specs/software-factory.md` | Delta |
