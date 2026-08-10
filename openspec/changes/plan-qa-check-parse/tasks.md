---
title: "plan-qa-check-parse — Implementation Plan"
ticket_id: T003112
domains: [plan-authoring, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-qa-check-parse — Implementation Plan

_Ticket: T003112_

## File Structure

| Datei | Art | S1-Budget |
|---|---|---|
| `scripts/plan-qa-check.sh` | Modify | Ist 229 · nicht gebaselined · Limit `.sh` 800 → **Budget 571**; die Aenderung ersetzt drei Parse-Bloecke durch einen und fuegt die Ergebniszeile ein, erwartete Netto-Aenderung < +40 Zeilen |
| `tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats` | Neu (liegt bereits vor, RED) | neue Datei · `.bats` hat kein `.sh`-Limit im S1-Scope; 246 Zeilen, unveraendert uebernommen |
| `openspec/specs/dev-flow-plan.md` | Modify (erst beim Archivieren, via `/opsx:archive`) | Ist 754 · nicht gebaselined · `.md` steht nicht unter S1 |

Nicht angefasst: `.claude/skills/dev-flow-plan/SKILL.md`. Der Aufruf dort
(`bash scripts/plan-qa-check.sh … || true`, Zeile 187) bleibt korrekt — die Ergebniszeile
wirkt ueber den Output, nicht ueber den Exit-Code, genau deshalb ist sie der richtige Traeger.

<!-- vitest: kein neuer Test noetig, weil keine Datei unter website/src/ beruehrt wird -->

## Task 1: RED — der Test liegt vor und ist rot

Die Testdatei `tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats` ist mit diesem Plan
bereits committet und beschreibt den Zielvertrag. Sie startet einen lokalen Fixture-Gateway
(kein echter LLM-Aufruf: die GPU-Backends des Gateways auf Port 18235 sind haeufig `degraded`
und teilen sich exklusiv eine GPU — ein Test dagegen misst die Tagesform der Hardware).

Vor der Umsetzung ausfuehren und den roten Stand bestaetigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats
# expected: FAIL — 5 von 5 rot (Stand 2026-08-10, vor dem Fix)
```

> Die Ausgabe pruefen, nicht nur den Exit-Code: `bats <nicht-existierende-datei.bats>` endet
> mit Exit 0 (T003278). Erwartet wird die Zeile `1..5` gefolgt von fuenf `not ok`.

Die fuenf Faelle:

1. Wohlgeformtes JSON → `RESULT: PASS` (Positiv-Anker, T002356-M1).
2. JSON im Markdown-Fence → der inhaltliche Befund erscheint, `Could not parse missing items`
   nicht, Ergebniszeile `RESULT: FAIL`.
3. Prosa-Antwort ohne JSON → `RESULT: ERROR` mit Antwort-Auszug, **kein** `RESULT: PASS|FAIL`.
4. Gateway tot → `RESULT: SKIPPED`, exit 0, **kein** `RESULT: PASS`.
5. Prosa-Antwort → kein Auto-Fix-Versuch, Plandatei unveraendert.

## Task 2: Content-Extraktion und Verdict-Parse in einem Durchgang

In `scripts/plan-qa-check.sh` die drei getrennten `python3 -c`-Bloecke (Zeilen ~169-197: je
einer fuer `VERDICT`, `MISSING`, `SUGGESTIONS`, jeder mit eigenem `json.loads()` und eigenem
stillen `except`) durch **einen** Block ersetzen, der aus dem Content genau einmal parst und
alle drei Felder zusammen ausgibt.

Extraktionsreihenfolge im neuen Block:

1. Content als Ganzes mit `json.loads()` versuchen.
2. Scheitert das: einen ```` ``` ````-Fence entfernen (optionaler Sprach-Tag `json`) und erneut
   versuchen.
3. Scheitert das: das erste balancierte `{…}`-Objekt im Text isolieren und parsen.
4. Scheitert auch das oder fehlt `verdict`: als **nicht interpretierbar** signalisieren
   (eigener Exit-Code oder ein Sentinel-Feld) — **nicht** still `FAIL` einsetzen.

Uebergabe an bash so waehlen, dass mehrzeilige `suggestions` und `missing`-Eintraege mit
Sonderzeichen unbeschadet ankommen (z. B. NUL-getrennte Felder mit `read -r -d ''`, oder eine
Zwischendatei in `$TMPDIR`). Kein `eval` auf Modell-Output.

Der Fall „`verdict` ist da, aber `missing` fehlt" ist kein Fehler: leere Liste, `RESULT: FAIL`
mit dem Hinweis, dass das Modell keine Positionen genannt hat.

## Task 3: Ergebniszeile `RESULT: <STATUS>` auf jedem terminierenden Pfad

Eine Helferfunktion einfuehren (z. B. `result() { info "RESULT: $1${2:+ — $2}"; }`) und an
jedem Ausgang genau einmal aufrufen. Die bestehenden Meldungstexte bleiben stehen — die
Ergebniszeile tritt daneben, ersetzt sie nicht.

| Ausgang im Skript (heutige Zeile) | Status |
|---|---|
| Payload nicht baubar (~102) | `SKIPPED` |
| Gateway `/livez` nicht erreichbar (~118) | `SKIPPED` |
| curl-Request fehlgeschlagen (~141) | `SKIPPED` |
| Gateway-HTTP != 200 (~149) | `SKIPPED` |
| Gateway-Envelope unparsebar (~164) | `ERROR` |
| Content nicht interpretierbar (neu, Task 2) | `ERROR` |
| Verdict PASS (~199) | `PASS` |
| Verdict FAIL nach `MAX_ITERATIONS` (~225) | `FAIL` |

Die frueh abbrechenden Vorpruefungen (Plan zu kurz, kein Frontmatter, Datei fehlt, fehlendes
Argument) bleiben bei `exit 1` ohne Ergebniszeile: sie sind Benutzungsfehler des Aufrufers,
kein Ausgang der Pruefung.

Genau eine Zeile pro Lauf — der Test greppt auf das Token `RESULT:[[:space:]]*<STATUS>` und
schlaegt fehl, wenn zusaetzlich ein widersprechender Status erscheint.

## Task 4: Auto-Fix-Loop nur bei verstandener Antwort

Der Loop (~208-222) haengt heute die — bei einem Parse-Ausfall leere — `suggestions` als
`## QA-Ergaenzungen` an den geprueften Plan und laeuft eine zweite, ergebnislose Iteration.

- Bei `ERROR` (Content nicht interpretierbar): sofort mit `RESULT: ERROR` beenden, ohne
  Append, ohne Folge-Iteration. Ausgabe enthaelt einen Auszug des tatsaechlichen Contents
  (erste ~300 Zeichen, einzeilig normalisiert), damit der Ausfall untersuchbar ist.
- Bei `FAIL` mit leeren `suggestions`: kein Append (es gibt nichts anzuhaengen), zweite
  Iteration ueberspringen, `RESULT: FAIL` mit den genannten Positionen.
- Bei `FAIL` mit Inhalt: Verhalten unveraendert.

Die bestehende Frontmatter-Rettung nach dem Append (~218) und die Backup-Wiederherstellung am
Ende bleiben unangetastet.

## Task 5: Test gruen und Regressionsschutz

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats
# expected: 5 von 5 ok
```

Die bestehenden Nachbartests muessen mitlaufen — die Konvention T002416 laesst Sammeldatei und
Verzeichnis gleichzeitig gelten, eine gezielte Suche nach nur einer Form findet die Haelfte
(T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/dev-flow-plan*
```

Erwartet: `plan-qa-livez-probe.bats` und `plan-qa-payload.bats` bleiben gruen. Beide sprechen
dieselben Ausgangspfade an, die Task 3 anfasst — die Livez-Probe erwartet dort weiterhin die
Meldung `not reachable`, deshalb ergaenzt die Ergebniszeile den Text und ersetzt ihn nicht.

Zusaetzlich einen echten Plan gegen den laufenden Gateway pruefen, sofern erreichbar (nur
Sichtprobe, kein Gate — das Ergebnis haengt an der GPU-Verfuegbarkeit):

```bash
bash scripts/plan-qa-check.sh openspec/changes/plan-qa-check-parse/tasks.md || true
```

## Task 6: Abschliessende Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusaetzlich, weil eine neue Testdatei hinzukommt (CI-Inventar-Check ist fail-closed):

```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json
```

Und das harte Plan-Gate auf diesen Plan selbst:

```bash
bash scripts/plan-lint.sh openspec/changes/plan-qa-check-parse/tasks.md
```
