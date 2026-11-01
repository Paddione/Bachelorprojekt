# p4 — Tests + generierte Artefakte + Live-Beleg

## Rotphase (zuerst, auf ungeänderter Basis)
Den Test aus „Offline-Test" unten vorab schreiben und laufen lassen:
`bash scripts/pytest-run.sh tests/py/spec/remaining_root_specs/domain_registry/test_domains_probe.py`
— expected FAIL (`scripts/domains-probe.mjs` fehlt, `test_validate_only_passes`
bricht mit Exit ≠ 0 ab). Beleg (Fail-Output) in `phase-events.log` notieren.
Erst danach p1–p3 umsetzen, dann derselbe Befehl → grün.

## Offline-Test (neu, CI-sicher, kein Netzwerk)
`tests/py/spec/remaining_root_specs/domain_registry/test_domains_probe.py`
(Budget 800, Plan ≈ 150), Muster nach `test_domains_registry.py`:
1. `test_validate_only_passes`: `node scripts/domains-probe.mjs --validate-only`
   auf der echten Registry → Exit 0 (fängt Schema- und Auflösungs-Drift).
2. `test_invalid_fixtures_fail`: zwei temporäre Fixture-Registries —
   (a) live Eintrag ohne `expect`, (b) `${UNAUFLOESBAR}` im Host — je mit
   `--registry <tmp> --validate-only` → Exit ≠ 0.
3. `test_devmesh_skip_semantik`: Fixture mit devmesh-Host + Stub, der
   ENOTFOUND simuliert? **Nein** — kein Netzwerk-Mocking im Python-Test
   (Scope!). Stattdessen: Testet, dass `--cluster fleet` einen reinen
   devmesh-Fixture-Lauf mit `0 FAIL` beendet (Filter-Logik offline prüfbar).
   Die echte SKIP-Semantik belegt der Live-Lauf (unten).

## Generierte Artefakte (Lehre aus PR #7040 — beides im selben Commit-Push)
- `task test:evals:update` → `tests/evals/golden/task-list-all.txt` (+1 Zeile
  `domains:probe`); Commit-Scope MUSS aus `commitlint.config.cjs` stammen
  (`chore(test)` ist gültig, `chore(evals)` ist es NICHT).
- `task test:inventory` → `components/website/src/data/test-inventory.json`
  (+1 Eintrag); einchecken, sonst failen `freshness:check` (Unit-Job) und
  `test_inventory_..._deckungsgleich` (Spec-Shard).

## Live-Beleg (K4-Bestandteil, manuell ab Tailnet-Host)
`task domains:probe` (Default `both`) vollständig grün laufen lassen
(fleet-PASS + devmesh-PASS statt SKIP — andernfalls fehlt der K4-Beleg für
devmesh). Volle stdout in den PR-Body kopieren. Bleibt ein Host FAIL/SKIP,
gehört die Begründung + Folge-Aktion in den PR-Body (kein stilles Anpassen
von `expect` — siehe p2-Regel).

## Gates
- `bash scripts/pytest-run.sh tests/py/spec/remaining_root_specs/domain_registry/` → alle grün.
- `git diff --exit-code` nach `test:evals:update` + `test:inventory` ist leer
  (d. h. beide committed).
