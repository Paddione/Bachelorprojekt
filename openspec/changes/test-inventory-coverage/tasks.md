---
title: "test-inventory-coverage — Implementation Plan"
ticket_id: T002445
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# test-inventory-coverage — Implementation Plan

_Ticket: T002445 · Proposal: `openspec/changes/test-inventory-coverage/proposal.md`_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/build-test-inventory.sh` | 87 | 413 |
| `tests/spec/ci-cd/test-inventory-coverage.bats` | 126 | — (`.bats` unterliegt keinem S1-Limit) |
| `tests/spec/ci-cd/spec-dir-convention.bats` | 94 | — (`.bats` unterliegt keinem S1-Limit) |
| `website/src/data/test-inventory.json` | 339 Einträge | — (generiert) |
| `openspec/changes/test-inventory-coverage/specs/ci-cd.md` | neu | — |

`scripts/build-test-inventory.sh` ist nicht gebaselined; wirksame Schwelle ist das statische
`.sh`-Limit 500. Die geplanten Änderungen liegen bei rund 30 Zeilen. Kein Split nötig.

`website/src/data/test-inventory.json` ist ein generiertes Artefakt und ein bekannter
Konflikt-Magnet. Es wird ausschließlich in Task 6 durch `task freshness:regenerate` erzeugt,
niemals von Hand editiert. Bei Merge-Konflikt gilt die Repo-Konvention: neu generieren, nicht
mergen.

`tests/spec/ci-cd/spec-dir-convention.bats` wird angefasst, obwohl es nicht Ursache des Bugs ist.
Grund: Sein Test `spec-dir: Test-Inventar erfasst Unterverzeichnisse` behauptet genau die
Eigenschaft, die dieser Change herstellt, prüft sie aber am Skripttext statt am Ergebnis. Bliebe
er unverändert, stünde nach dem Fix ein grüner Test mit richtiger Aussage neben einem grünen Test
mit zufällig richtiger Aussage — und der zweite würde beim nächsten Umbau der Erfassungslogik
wieder falsch grün.

## Task 1 — RED bestätigen

Der Test liegt bereits auf dem Branch (Fix-Pfad-Pflicht: failing Test vor Plan). Dieser Schritt
bestätigt nur, dass er aus den richtigen Gründen rot ist, bevor irgendetwas implementiert wird.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/test-inventory-coverage.bats
# expected: FAIL — 8 von 8 rot
```

Alle acht scheitern derzeit an derselben Vorbedingung: `build_sandbox_inventory` schlägt fehl,
weil `scripts/build-test-inventory.sh` die Variable `TEST_INVENTORY_OUT` noch nicht kennt und die
Sandbox-Datei deshalb leer bleibt. Das ist erwartet und wird von Task 2 aufgelöst — erst danach
messen die Tests 2 bis 8 tatsächlich das, was ihre Titel behaupten.

Verifiziert am 2026-07-28: Der RED-Lauf mutiert `website/src/data/test-inventory.json` **nicht**,
weil der Erzeuger idempotent ist und ohne Fix exakt die committete Liste reproduziert. Nach dem
Lauf muss `git status --porcelain` außer der neuen Testdatei nichts zeigen.

## Task 2 — Ausgabepfad umlenkbar machen

In `scripts/build-test-inventory.sh` die feste Zuweisung von `OUT` durch eine überschreibbare
ersetzen:

```bash
OUT="${TEST_INVENTORY_OUT:-${REPO_ROOT}/website/src/data/test-inventory.json}"
```

Das ist Vorbedingung für jede Ergebnisprüfung: Ohne sie müsste jeder Test das committete Inventar
überschreiben. Sonst ändert sich am Skript nichts.

Grün-Nachweis:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/test-inventory-coverage.bats
# erwartet: Test 1 "Ausgabepfad ist ueber TEST_INVENTORY_OUT umlenkbar" grün.
# Test 6 (54 FA-SF-Einträge) und Test 7 (Schema) werden hier ebenfalls grün und
# müssen es ab jetzt bleiben — sie sind die Wächter gegen ein Überschießen in Task 3.
# Tests 2, 3, 4, 5, 8 bleiben rot.
```

## Task 3 — Pfad-Fallback für Dateien ohne strukturierte ID

In der Tier-Schleife den stillen `continue` ersetzen, der greift, wenn der `@test`-Grep keine ID
gefunden hat. Statt die Datei zu überspringen, wird eine Kennung aus dem Pfad relativ zum
Tier-Verzeichnis ohne Endung gebildet:

- `tests/spec/software-factory/collision-window.bats` → `id: software-factory/collision-window`,
  `category: software-factory`
- `tests/spec/ci-cd.bats` → `id: ci-cd`, `category: ci-cd`

`category` ist bei mehrstufigen Pfaden das erste Pfadsegment unterhalb des Tiers (der
SSOT-Spec-Slug), bei Dateien auf oberster Ebene der Dateiname ohne Endung. `kind` bleibt `shell`,
`tier` wird wie bisher vor dem Schreiben entfernt.

Der Fallback greift **nur** im bisherigen `continue`-Zweig. Beide bestehenden Erkennungswege
bleiben unangetastet und haben Vorrang — sonst verlöre `software-factory.bats` seine 54
`FA-SF-*`-Einträge zugunsten eines einzelnen Slug-Eintrags.

Der Fallback ist bewusst nicht auf `tests/spec` beschränkt: Dieselbe Ursache trifft drei Dateien
in `tests/local/` (`admin-actions-schema.bats`, `e2e-skill-selfpatch.bats`,
`mandatory-sequences.bats`). Eine tier-spezifische Sonderbehandlung wäre willkürliche Komplexität.

Grün-Nachweis:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/test-inventory-coverage.bats
# erwartet: Tests 1–7 grün, insbesondere Test 5 "jede tests/spec-Datei ist erfasst".
# Test 6 (54 Einträge für software-factory.bats) muss grün BLEIBEN — wird er rot,
# hat der Fallback die strukturierten IDs verdrängt.
# Test 8 (Deckungsgleichheit mit dem committeten JSON) bleibt rot bis Task 6.
```

## Task 4 — Fail-closed-Guard

Am Ende von `scripts/build-test-inventory.sh`, nach dem Schreiben der Ausgabe, prüfen, dass jede
in den drei Tier-Verzeichnissen gefundene Shell-Testdatei mindestens einen Eintrag hat. Andernfalls
mit Exit-Status ungleich 0 abbrechen und die betroffenen Pfade auflisten.

Der Guard braucht **keinen** eigenen Test und bekommt keinen. Nach Task 3 kann per Konstruktion
keine Datei mehr unerfasst bleiben, ein Test dafür könnte also nur vakuos bestehen — genau der
Fehler, den dieser Change behebt. Stattdessen gehört ein Kommentar ins Skript, der festhält, dass
der Guard heute nicht auslösen kann und ausschließlich künftige Änderungen an der
Erfassungslogik absichert.

Grün-Nachweis:

```bash
TEST_INVENTORY_OUT=/tmp/inv-guard.json bash scripts/build-test-inventory.sh
echo "exit=$?"
# erwartet: exit=0 und keine Guard-Meldung — kein Regressionsfall vorhanden.
```

## Task 5 — `spec-dir-convention.bats` auf Ergebnisprüfung umstellen

Den Test `spec-dir: Test-Inventar erfasst Unterverzeichnisse` in
`tests/spec/ci-cd/spec-dir-convention.bats` so umschreiben, dass er das Ergebnis prüft statt des
Skripttexts: Inventar nach `TEST_INVENTORY_OUT` erzeugen und belegen, dass eine Datei unterhalb
von `tests/spec/<slug>/` einen Eintrag hat.

Die `maxdepth`-Assertions entfallen ersatzlos. Sie prüften ein Implementierungsdetail, das den Bug
gar nicht verursacht hat — `maxdepth 2` war und ist korrekt gesetzt.

Die übrigen fünf Tests der Datei (Runner-Rekursion, Zähl-Logik, `find-changed-tests`,
`merge=union`-Verbot, CLAUDE.md-Dokumentation) bleiben unverändert.

Grün-Nachweis:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-dir-convention.bats
# erwartet: alle 6 grün, darunter der umgeschriebene Ergebnis-Test.
```

## Task 6 — Inventar regenerieren und Gesamtverifikation

Das committete Inventar neu erzeugen und mitcommitten — ohne diesen Schritt ändert sich nur der
Erzeuger, nicht das Artefakt, das die Website liest.

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartungen:

- `website/src/data/test-inventory.json` wächst von 339 auf rund 480 Einträge.
- `git diff --stat` zeigt neben dem JSON nur `scripts/build-test-inventory.sh` und die beiden
  `.bats`-Dateien.
- Die vollständige Suite ist grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/test-inventory-coverage.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/spec-dir-convention.bats
# erwartet: 8/8 bzw. 6/6 grün, insbesondere Test 8 "committetes JSON ist mit dem
# Builder-Ergebnis deckungsgleich".
```

Abschließend prüfen, dass `website/src/pages/api/admin/tests/traceability.ts` unverändert
bleibt: Das Schema ändert sich nicht, also darf am Konsumenten nichts anzupassen sein. Ist doch
eine Anpassung nötig, wurde das Schema entgegen der Absicht verändert.

<!-- vitest: kein neuer Test nötig, weil an website/src kein Code geändert wird — berührt sind
     dort nur das generierte Datenartefakt test-inventory.json und, rein prüfend, der unveränderte
     Konsument traceability.ts. Das Schema {id,file,category,kind} bleibt identisch; abgesichert
     wird es von Test 7 in tests/spec/ci-cd/test-inventory-coverage.bats. -->

