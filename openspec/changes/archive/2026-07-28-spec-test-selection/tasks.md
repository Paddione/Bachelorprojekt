---
title: "spec-test-selection — Implementation Plan"
ticket_id: T002345
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# spec-test-selection — Implementation Plan

_Ticket: T002345_

`task test:changed` ist das Pflicht-Gate vor jedem PR. Für Änderungen unter `scripts/**`
läuft die spec-Suite nicht — und zwar aus zwei unabhängigen Gründen, die beide behoben
werden müssen:

**Grund 1 — der Taskfile fragt den spec-Finder gar nicht.** `RUN_SPEC` wird nur gesetzt, wenn
der Diff `tests/spec/` oder `scripts/llm-proxy/` enthält. Eine reine Änderung an
`scripts/factory/queue.sh` setzt `RUN_SCRIPTS` und `RUN_FACTORY`, aber nicht `RUN_SPEC`.
`RUN_FACTORY` fährt `task test:factory`, und das läuft `tests/local/FA-SF-*.bats` — **nicht**
`tests/spec/software-factory.bats`.

**Grund 2 — der spec-Finder kann `scripts/**` ohnehin nicht präzise auflösen.** In
`scripts/find-changed-tests.sh` behandelt ein eigener Zweig alle `scripts/*`-Dateien:
Namensabgleich gegen `<name>.bats`, `vda-<name>.bats`, `ticket-<name>.bats`,
`factory-<name>.bats`; schlägt der fehl, `RUN_ALL=true` und `continue`. Das `continue`
springt über die Pfad-Probe hinweg (aktuell ca. Zeile 109–125), die den geänderten Pfad in
den spec-Dateien greppt, die Vorfahrenverzeichnisse hochläuft und den tiefsten Treffer wählt.

Messung am 2026-07-28: `scripts/factory/queue.sh` liefert über `RUN_ALL` **138 Suiten**
(~10–20 min). Die Pfad-Probe hätte `tests/spec/software-factory.bats` geliefert — genau eine
Datei, verifiziert per `grep -lF -- "scripts/factory/queue.sh" tests/spec/*.bats`.

Zusammen ergibt das ein False-Green: Ein Fix an `scripts/factory/*.sh` besteht das
Pflicht-Gate, ohne dass die Suite läuft, die ihn absichert. Genau das ist bei T002333
passiert — der Test lag nur deshalb im Lauf, weil dieselbe Änderung zufällig auch
`tests/spec/software-factory.bats` anfasste.

Bewusst **kein** generiertes Mapping-Artefakt: Die Ableitung existiert bereits als
Laufzeit-Probe mit Memoisation (`PROBE_CACHE`). Eine committete Map würde dieselbe Information
duplizieren und ein Staleness-Gate brauchen, das die Live-Ableitung nicht hat.

## File Structure

```
scripts/find-changed-tests.sh   (geändert — scripts/*-Zweig fällt zur Pfad-Probe durch)
Taskfile.yml                    (geändert — RUN_SPEC auch für scripts/**)
tests/spec/ci-cd.bats           (geändert — 2 Tests, bereits im Stage-Commit)
openspec/changes/spec-test-selection/specs/ci-cd.md   (neu — Delta-Spec)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die beiden Tests liegen bereits im Stage-Commit dieses
      Branches in `tests/spec/ci-cd.bats` (Marker `T002345`). Der erste verlangt, dass eine
      `scripts/`-Änderung ohne Namenstreffer **genau** die referenzierende Suite auswählt.
      Der zweite ist die Gegenprobe: Findet weder Namensabgleich noch Pfad-Probe etwas, muss
      `RUN_ALL` weiterhin greifen — ohne ihn könnte der Fix die Absicherung still in „gar
      nichts auswählen" umkippen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "T002345"
# expected: FAIL (rot — Test 1 liefert alle Suiten statt der einen; Test 2 ist bereits grün)
```

- [ ] **Fix-Step A (GREEN) — Durchfall zur Pfad-Probe.** In
      `scripts/find-changed-tests.sh` den `scripts/*`-Zweig so umbauen, dass er bei
      fehlgeschlagenem Namensabgleich **nicht** sofort `RUN_ALL=true; continue` setzt.
      Stattdessen für `TYPE=spec` erst die Pfad-Probe laufen lassen; nur wenn auch sie leer
      bleibt, `RUN_ALL=true`.

      Die bestehende Ausnahme für `scripts/find-changed-tests.sh` selbst (kein `RUN_ALL`,
      weil die Selektionslogik der Prüfgegenstand ist) muss erhalten bleiben.
      Für `TYPE=unit` bleibt das Verhalten unverändert — die Pfad-Probe ist ausdrücklich
      spec-spezifisch.

      Die Probe steht derzeit weiter unten in der Schleife. Sie in eine Funktion
      (z. B. `probe_spec_for_path`) herausziehen und von beiden Stellen aufrufen, statt sie
      zu duplizieren — sonst driften die zwei Kopien auseinander.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "T002345|T002245"
# expected: PASS (grün — inklusive der beiden T002245-Bestandstests zur Probe-Semantik)
```

- [ ] **Fix-Step B (GREEN) — RUN_SPEC für scripts/**.** In `Taskfile.yml` (Task
      `test:changed`) die `RUN_SPEC`-Regex um `scripts/` erweitern, damit der spec-Finder
      für Skript-Änderungen überhaupt konsultiert wird. Der punktuelle
      `scripts/llm-proxy/`-Zweig aus T002336 wird dadurch redundant und kann entfallen —
      der Kommentar dort erklärt genau diesen Fall und sollte auf den allgemeinen
      Mechanismus umgeschrieben, nicht gelöscht werden.

      Wichtig: Ohne Fix-Step A würde diese Erweiterung bei **jeder** Skript-Änderung
      `RUN_ALL` auslösen und `test:changed` faktisch zu `test:all` machen. Die Reihenfolge
      A vor B ist deshalb nicht optional.

```bash
# Gegenprobe am echten Repo: eine reine queue.sh-Aenderung waehlt genau eine Suite
git stash list >/dev/null; printf '\n# probe\n' >> scripts/factory/queue.sh
git add scripts/factory/queue.sh && git -c core.hooksPath=/dev/null commit -q -m probe
bash scripts/find-changed-tests.sh spec
# expected: nur tests/spec/software-factory.bats
git reset --hard HEAD~1
```

- [ ] **Regressionsschutz gegen Laufzeit-Explosion.** Nach Fix-Step B prüfen, dass eine
      typische Skript-Änderung nicht mehr die Gesamtsuite zieht. Falls doch, ist die
      Pfad-Probe nicht erreicht worden und Fix-Step A ist unvollständig.

```bash
bash scripts/find-changed-tests.sh spec | wc -l
# expected: eine einstellige Zahl, nicht 138
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
