---
title: "stray-dir-validate-guard — Implementation Plan"
ticket_id: T015759
domains: [scripts, openspec]
status: active
file_locks: [scripts/openspec.sh, tests/spec/openspec-workflow/stray-dir-validate-guard.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# stray-dir-validate-guard — Implementation Plan

_Ticket: T015759_

## File Structure

```
scripts/openspec.sh                                              (modified — cmd_validate + cmd_propose)
tests/spec/openspec-workflow/stray-dir-validate-guard.bats       (new — BATS-Guard)
```

## Tasks

### Partial 1: Guards + BATS-Guard (Implementation + Tests)

1. **RED — BATS-Guard anlegen.** Neue Datei
   `tests/spec/openspec-workflow/stray-dir-validate-guard.bats` mit Fixture-Setup
   (`OPENSPEC_ROOT` auf tempdir, Muster bestehender Tests in `tests/spec/openspec-workflow/`):
   - **Test A:** Fixture mit leerem Dir `changes/--help/` UND einem gültigen Change →
     `validate` endet rc=0, Ausgabe enthält `openspec validate: OK`, stderr enthält
     `WARN: skipping empty stray dir: --help`.
   - **Test B:** Fixture, in dem das Stray-Dir NICHT leer ist (z. B. nur `notes.txt`) →
     `validate` failt weiterhin fail-closed (rc≠0) — der Guard darf nichts verschleiern.
   - **Test C:** `propose --help --ticket T000000` (mit `TICKET_OFFLINE=1` gegen die Fixture) →
     rc≠0, Fehlermeldung zum Slug, danach existiert kein Verzeichnis `changes/--help/`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/stray-dir-validate-guard.bats
# expected: FAIL (red — beide Guards sind noch nicht implementiert)
```

2. **GREEN — Guards implementieren** in `scripts/openspec.sh`:
   - `cmd_validate`: nach dem `archive`-Skip und vor der `specs`-Prüfung leere Dirs erkennen
     (`[[ -z "$(ls -A "$dir" 2>/dev/null)" ]]`), dann `echo "WARN: skipping empty stray dir:
     $base" >&2; continue`.
   - `cmd_propose`: direkt nach dem `--help`-Frühcheck und vor der Options-Loop:
     `[[ "$slug" == -* ]] && die "slug must not start with '-': $slug"`.
   - Stil an den vorhandenen Guards orientieren (deutsche Kommentare mit Ticket-Tag [T015759],
       gleiche Einrückung, `die` für Frühaborts).

3. **Verifizieren.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/stray-dir-validate-guard.bats
# expected: PASS (green)
bash scripts/openspec.sh validate
# expected: openspec validate: OK (Bestands-Gate unverändert grün)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** BATS-Guard vor der Implementierung laufen lassen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/stray-dir-validate-guard.bats
# expected: FAIL (red — die Guards sind noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Beide Guards umsetzen, bis der BATS-Guard grün ist und das
      Bestands-Gate (`bash scripts/openspec.sh validate`) unverändert `OK` meldet.

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
