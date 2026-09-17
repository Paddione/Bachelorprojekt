---
title: CI-Node-Deps und BATS-Laufzeitausreisser
ticket_id: T013674
domains: [ci-cd, software-factory]
status: plan_staged
---

# CI-Node-Deps und BATS-Laufzeitausreisser — Implementation Plan

## File Structure

| Datei | Art | Zeilen jetzt | Zeilen danach | Wirksame S1-Schwelle | Budget |
|---|---|---|---|---|---|
| `.github/workflows/ci.yml` | geändert | 925 | ~937 | keine S1-Grenze für Workflows | — |
| `tests/unit/tickets-transition.bats` | geändert | 345 | ~338 | 500 (Limit, keine Baseline) | 162 |
| `tests/unit/test_art_library_manifest.bats` | geändert | 45 | ~42 | 500 (Limit, keine Baseline) | 458 |
| `tests/spec/agent-lock-claim-persist.bats` | geändert | 137 | ~142 | 500 (Limit, keine Baseline) | 358 |
| `tests/spec/ci-cd/test-inventory-coverage.bats` | geändert | 160 | ~155 | 500 (Limit, keine Baseline) | 345 |
| `tests/spec/ci-cd/unit-tests-no-dependency-skips.bats` | neu, bereits committed | 75 | 75 | 500 (Limit, keine Baseline) | 425 |
| `openspec/changes/ci-node-deps-bats-outliers/specs/ci-cd.md` | neu, bereits committed | 34 | 34 | — | — |

Keine Datei nähert sich ihrem Budget; kein Verkleinerungs- oder Split-Schritt nötig.

## Kontext

Zwei Befunde aus derselben Laufzeitanalyse. Teil A ist eine Abdeckungslücke, Teil B sind
Laufzeitausreißer im Testaufbau. Sie teilen sich ein Ticket, weil beide über den
`test-bats`-Job zusammenhängen und beide aus derselben Messung stammen.

Der RED-Test `tests/spec/ci-cd/unit-tests-no-dependency-skips.bats` liegt bereits im
Branch und ist rot (2 Tests). Er deckt Teil A ab. Teil B sind Test-Refactorings ohne
Verhaltensänderung — dort ist der Nachweis nicht ein neuer Test, sondern dass die
bestehenden Tests unverändert dieselben Aussagen treffen.

## Aufgaben

### 1. Rotphase bestätigen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/unit-tests-no-dependency-skips.bats
```

expected: FAIL — beide Tests scheitern. Test 1 an
`grep -qe 'components/website'` gegen den `test-bats`-Job-Block, Test 2 an fünf Fundstellen
(`tickets-transition.bats:148,159,170,181` und `test_art_library_manifest.bats:15`). Die
Positiv-Anker beider Tests müssen davor durchlaufen sein.

### 2. pnpm-Setup und Installation in den test-bats-Job

In `.github/workflows/ci.yml`, Job `test-bats`, nach `actions/setup-node` und vor
`Install node dependencies`:

```yaml
      - name: Set up pnpm
        uses: pnpm/action-setup@a15d269cd4658e1107c09f1fabf4cbd7bd1f308a  # v5.4.0
        with:
          version: 10
```

und nach `npm ci` ein eigener Schritt:

```yaml
      - name: Install website dependencies
        run: pnpm install --frozen-lockfile --dir components/website
```

Die Action-SHA ist dieselbe wie im `test-spec-shard`- und im `test-website`-Job; Renovate
hält die drei zusammen. Der Schritt läuft unbedingt, nicht hinter einer
`paths`-Bedingung: `test-bats` ist der Job, der auf jedem PR läuft, und die vier Tests
sollen genau deshalb dort liegen.

Erwartete Zusatzkosten: mit pnpm-Store-Cache 15-40 s. Der Wert ist zu messen, nicht zu
schätzen — siehe Aufgabe 7.

### 3. Die vier skip-Zweige in tickets-transition.bats entfernen

`tests/unit/tickets-transition.bats`, Zeilen 148, 159, 170, 181:

```bash
-  if ! tsx_available; then skip "components/website/node_modules not installed (run npm install in components/website/)"; fi
```

Die Helper-Funktion `tsx_available` (Zeile 55-57) wird damit unbenutzt und entfällt
ebenfalls.

Ohne den skip-Zweig ist der Test fail-closed: fehlt die Installation, wird er rot statt
`ok`. Das ist der eigentliche Zweck der Änderung — nicht die vier Tests laufen zu lassen,
sondern zu verhindern, dass ihr Nichtlaufen unsichtbar bleibt.

Die vier Tests brauchen keine Datenbank. `transition.ts` wirft alle geprüften Meldungen
in seiner Validierung (Zeile 47 `invalid status`, 50 `requires a resolution`, 53
`invalid resolution`), bevor Zeile 68 die erste Abfrage absetzt. Die acht weiteren
Runtime-Tests derselben Datei skippen weiterhin mit
`No database available (set TRACKING_DB_URL)` — das ist eine andere Sache und bleibt
außerhalb dieses Tickets.

Ein Fallstrick beim lokalen Nachvollziehen: im Haupt-Checkout können
`components/website/node_modules/pg` und `.bin/tsx` gebrochene Symlinks sein (pnpm-Layout,
Ziel unter `.pnpm/` fehlt). `ls -d` zeigt sie dann, `[[ -d ]]` folgt ihnen und findet
nichts. Wer lokal einen Fehlschlag sieht, prüft zuerst
`readlink -e components/website/node_modules/pg`, bevor er ihn dem Code zuschreibt.

### 4. Installation aus test_art_library_manifest.bats in einen CI-Step ziehen

`tests/unit/test_art_library_manifest.bats`, `setup_file` (Zeile 12-18): der
`npm install`-Aufruf samt `|| skip` entfällt. Stattdessen ein Schritt im `test-bats`-Job
vor der BATS-Suite:

```yaml
      - name: Install art-library tooling dependencies
        run: npm install --silent --prefix assets/art-library/_tooling
```

Bleibt im `setup_file` eine Prüfung, dann als harte Vorbedingung statt als `skip`: fehlt
`assets/art-library/_tooling/node_modules`, soll der Test fehlschlagen und benennen, dass
der CI-Step fehlt. Ein `skip` an dieser Stelle brächte genau das zurück, was der Guard aus
Aufgabe 1 verhindert.

`task test:art-library` installiert die Abhängigkeiten bereits selbst; der lokale Weg
bleibt damit unverändert nutzbar.

### 5. Race-Schleife in agent-lock-claim-persist.bats

`tests/spec/agent-lock-claim-persist.bats:96`, Test
`T001384-D2: claim mit worktree-Pfad überlebt parallelen reap`. Er läuft 30 Runden mit je
einem `claim`- und einem `reap`-Prozess. Gemessen mit `bats --timing`: 338120 ms von
380 s der Datei, also 89 % in diesem einen Test.

Die Aussage des Tests ist, dass ein lebender SID einen frischen Claim vor dem parallelen
Reaper schützt. Eine feste Rundenzahl belegt das nicht — sie erhöht nur die
Wahrscheinlichkeit, ein Zeitfenster zu treffen. Vorzuziehen ist, das Fenster gezielt
herzustellen statt es zu erwürfeln: den `reap` starten, während der `claim` nachweislich
zwischen Schreiben und Freigeben steht.

Lässt sich das nicht ohne Eingriff in `scripts/agent-lock.sh` erreichen — und dieser
Eingriff gehört nicht in dieses Ticket —, dann die Rundenzahl auf 5 senken und **im Test
begründen**, warum diese Zahl gewählt ist. Eine unbegründete Zahl wächst beim nächsten
Flake wieder.

T013673 senkt die Kosten eines einzelnen `reap` unabhängig davon um rund 3 s; beide
Wirkungen addieren sich, ersetzen einander aber nicht.

### 6. test-inventory-coverage.bats entschlacken

`tests/spec/ci-cd/test-inventory-coverage.bats` (166 s, 9 Tests), zwei unabhängige
Verstärker:

**Der Builder läuft neunmal.** `build_sandbox_inventory` steht im Körper jedes Tests. Der
Aufruf gehört nach `setup_file`, das Ergebnis in eine Datei unter `$BATS_FILE_TMPDIR`, auf
die alle Tests lesend zugreifen. Die `teardown`-Funktion (Zeile 30-38) räumt eine
Streudatei im Repo auf und bleibt unverändert je Test — sie hängt nicht am Inventar.

**659 jq-Forks für eine Mengendifferenz.** Zeile 96-103 iteriert über alle bats-Dateien
und startet pro Iteration ein eigenes `jq` gegen dieselbe JSON-Datei. Ein Aufruf genügt:
die erfassten Pfade einmal als Liste ausgeben (`jq -r '.[].file'`), gegen die gefundenen
Dateien vergleichen (`comm -23` über zwei sortierte Listen), und die Differenz ist die
Menge der nicht erfassten Dateien.

Beide Änderungen sind reine Umstellungen des Testaufbaus. Der Nachweis ist deshalb, dass
die Datei danach dieselbe Zahl Tests mit demselben Ergebnis liefert:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/ci-cd/test-inventory-coverage.bats   # muss 9 bleiben
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/test-inventory-coverage.bats
```

### 7. Wirkung messen, belegen und verifizieren

Ohne Zahlen ist die Rechtfertigung eine Behauptung (Mess-Konvention T002717). Zu erheben
und ans Ticket zu hängen, jeweils mit dem erzeugenden Befehl:

```bash
# Laufzeit der beiden entschlackten Dateien, vorher/nachher
tests/unit/lib/bats-core/bin/bats --timing tests/spec/agent-lock-claim-persist.bats
tests/unit/lib/bats-core/bin/bats --timing tests/spec/ci-cd/test-inventory-coverage.bats

# Zusatzkosten des pnpm-Steps im ersten CI-Lauf dieses Branches
gh run view <run-id> --json jobs \
  -q '.jobs[]|select(.name|test("BATS Unit"))|.steps[]|"\(.name): \(.startedAt) → \(.completedAt)"'
```

Referenzwerte auf `main @ cd50476db`: `agent-lock-claim-persist.bats` 380 s lokal
(CI-Gewicht 222 s), `test-inventory-coverage.bats` CI-Gewicht 166 s, Spec-Suite gesamt
4065 s laut `tests/spec/.spec-runtime.tsv`.

Fällt der Zusatzaufwand des pnpm-Steps deutlich über die erwarteten 40 s, gehört das
gemeldet statt hingenommen — dann ist die Abwägung aus dem Proposal neu zu treffen.

Abschliessend die Gesamtverifikation:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil die Änderung an `ci.yml` sonst erst im Lauf auffällt:

```bash
bash scripts/lint-workflows.sh
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/unit-tests-no-dependency-skips.bats
tests/unit/lib/bats-core/bin/bats tests/unit/tickets-transition.bats
```

Der Guard aus Aufgabe 1 muss grün sein, und `tickets-transition.bats` darf keinen der vier
Tests mehr überspringen — weder mit `ok … # skip` noch durch Fehlschlag.
