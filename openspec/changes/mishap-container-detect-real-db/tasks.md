---
title: "mishap-container-detect-real-db — Implementation Plan"
ticket_id: T004893
domains: [tests]
status: active
---

# mishap-container-detect-real-db — Implementation Plan

## File Structure

```
tests/spec/mishap-rollup/container-resolution-real-db.bats   (NEU — Real-DB-Regressionstest)
website/src/data/test-inventory.json                         (regeneriert via task test:inventory)
```

## Task 1 — RED: Der Real-DB-Guard liegt vor und ist gegen den Altcode rot

Kontext: Der Root-Cause-Fix (T004898, `status NOT IN ('done','archived')` statt
Allowlist) ist bereits auf main. Der RED-Beweis belegt, dass die Predicate-Assertion
des neuen Tests den historischen Defekt abdeckt: Gegen den prae-Fix-Stand emittiert
`cmd_rollup_container` die Allowlist-Query (`status IN ('triage',...)`) und der Test
schlaegt fehl; gegen den aktuellen Stand ist er gruen. Der Beweis ist beim Planen
(2026-08-14) einmalig gefuehrt und wird hier reproduzierbar gehalten.

Schritte (im Worktree, gegen die Live-DB — der Test skippt sauber, wenn kein Cluster
erreichbar ist oder die Produktions-Invariante "genau ein offener Container" verletzt):

1. Wegwerf-Worktree auf dem prae-Fix-Stand anlegen und den Test hineinkopieren:

```bash
git worktree add --detach /tmp/mishap-old-code 9f3e271ed
cp tests/spec/mishap-rollup/container-resolution-real-db.bats \
   /tmp/mishap-old-code/tests/spec/mishap-rollup/
```

2. RED-Lauf gegen den Altcode:

```bash
cd /tmp/mishap-old-code
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/container-resolution-real-db.bats
# expected: FAIL — Aussage C: `status NOT IN ('done','archived')` wird nicht
# emittiert; der Altcode filtert mit der Allowlist `status IN ('triage',...)`,
# genau der Defekt, der am 2026-08-14 das Duplikat T004752 neben T003533 erzeugt hat.
```

3. Wegwerf-Worktree entfernen:

```bash
cd /home/patrick/Bachelorprojekt
git worktree remove /tmp/mishap-old-code --force
```

4. Gegenprobe auf dem Branch (main-Stand, Fix live):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup/
# expected: PASS — der Test laeuft gegen die echte DB: rollup-container liefert
# den einzigen offenen Container (aktuell T005030), legt kein Duplikat an und
# emittiert das Predicate `status NOT IN ('done','archived')`.
```

Akzeptanz: Schritt 2 zeigt `not ok` ausschliesslich an der Predicate-Assertion,
Schritt 4 zeigt `ok`. Aussage A/B (Findergebnis gegen die echte DB, kein Duplikat)
bleiben in beiden Laeufen gruen — sie pinnen die Invariante, Aussage C pinnt den
historischen Defekt.

## Task 2 — GREEN: Test-Inventar regenerieren

Die neue BATS-Datei muss im CI-Inventar registriert werden (sonst failt
`task test:inventory`-Drift-Check):

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

Akzeptanz: `git diff --cached` enthaelt ausschliesslich
`website/src/data/test-inventory.json` mit dem neuen Eintrag
`container-resolution-real-db.bats`.

## Task 3 — Abschluss-Verifikation

Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusaetzlich der gezielte Lauf der Spec-Datei:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup/container-resolution-real-db.bats
```

Akzeptanz: alle Kommandos enden mit Exit 0; der Test ist gegen die lokale k3d-DB
gruen (kein Skip bei laufendem Cluster mit genau einem offenen Container).

Scope-Hinweis: Kein Production-Code in diesem Change (Fix ist T004898); kein
Anfassen von `tests/spec/software-factory/scheduling.bats`, `scripts/branch-reaper.sh`
oder plan-lint (parallele Sessions); T004894 (Areas-Trim, Welle 2) wird nicht
vorweggenommen.
