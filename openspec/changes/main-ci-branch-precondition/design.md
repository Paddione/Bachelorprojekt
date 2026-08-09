# Design: main-ci-branch-precondition

_Ticket: T003045_

## Goals

- `main` ist nach diesem Change wieder grün, ohne dass eine Zusicherung verloren geht.
- Die Wiedereinführung derselben Fehlerklasse fällt am Commit-Zeitpunkt auf, nicht erst
  nach dem Merge.

## Non-Goals

- Kein Umbau des betroffenen Tests auf eine Fixture (siehe Entscheidung 2).
- Keine Änderung an `scripts/worktree-create.sh` — dort ist nachweislich nichts defekt.
- Keine Ausweitung des Guards auf weitere Umgebungsabhängigkeiten von Tests (Uhrzeit, Netz,
  Arbeitsverzeichnis). Dafür liegt kein Befund vor.

## Entscheidungen

### 1. Der Fix gehört in den Test, nicht ins Skript

Eine gescheiterte Vorbedingung lässt zwei Lesarten zu: entweder die Vorbedingung ist falsch,
oder sie deckt einen echten Defekt im geprüften Skript zu. Die zweite Lesart ist geprüft und
widerlegt — `scripts/worktree-create.sh --help` liefert auf `main` rc=0, keine `FATAL`-Zeile
und nennt `--unattended` zweimal. Alle drei verbleibenden Zusicherungen des Tests halten dort.
Damit ist die Vorbedingung ersatzlos entbehrlich.

Diese Prüfung stand bewusst **vor** dem Lösungsentwurf (Bug-Triage-Konvention T002448-M5):
Symptom war „CI auf `main` rot", die Ursachenzuschreibung „Zeile 48 ist falsch" war zunächst
Hypothese und wurde erst durch die Messung zur Grundlage.

### 2. Keine Fixture, sondern Entfernen der Vorbedingung

Der naheliegende Alternativentwurf wäre, den Test wie seine Nachbarn gegen ein Wegwerf-Repo
laufen zu lassen. Er wird verworfen: die Aussage des Tests lautet „`--help` funktioniert auf
jedem Branch". Ein kontrolliertes Repo würde genau die Umgebungsvielfalt wegabstrahieren, die
den Test wertvoll macht — der Test soll das reale Repo treffen, er darf nur keine Annahme über
dessen Branch machen. Trade-off: der Test bleibt damit umgebungsabhängig, aber nur noch in
einer Richtung, die auf jedem Branch erfüllt ist.

### 3. Guard als Denylist, nicht als Allowlist

Die Allowlist-Variante („melde jede Branch-Abfrage, die nicht wie eine Fixture aussieht") fängt
auch unbekannte Umgehungsformen, macht aber jede neu eingeführte Fixture-Variable zum
Fehlalarm. Ein Guard, der bei legitimer Arbeit rot wird, wird abgeschaltet statt befolgt.
Gemeldet werden deshalb die zwei nachweislich betroffenen Formen: `git -C "$REPO_ROOT" …` und
`git …` ohne `-C`. Bekannte Grenze: eine dritte Schreibweise wie `-C "$PWD"` rutscht durch —
der bewusst gezahlte Preis, im Guard als Kommentar festgehalten.

### 4. Zwei Ausschlüsse sind konstruktiv notwendig

- **Kommentarzeilen.** `tests/spec/pr-refresh.bats:96` erwähnt das Muster im Fließtext. Ohne
  Ausschluss meldete der Guard dort einen Defekt, den es nicht gibt. Dieselbe Falle musste
  `tests/spec/ci-cd/spec-dir-convention.bats` zweimal nachbessern (T002503).
- **Die Guard-Datei selbst.** Sie trägt das gesuchte Muster in ihren eigenen Regexen und wäre
  sonst dauerhaft rot, unabhängig vom Zustand des Repos. Der Ausschluss wird aus
  `BATS_TEST_FILENAME` abgeleitet statt hart notiert, damit ein Umbenennen den Guard nicht
  still blind macht.

### 5. Zwei Positiv-Anker statt einem

Die Pflicht aus CLAUDE.md (T002356-M1) verlangt bei Negativtests einen Positiv-Anker. Hier
sind zwei nötig, weil es zwei Wege ins vakuose Bestehen gibt: der Scanner findet keine
`.bats`-Dateien (falscher Pfad), oder er findet sie, aber sein Suchmuster greift nicht
(Regex-Drift). Anker 1 prüft das Erste, Anker 2 das Zweite — Letzterer, indem er die
**erlaubte** Fixture-Form in einer anderen Datei als der eigenen nachweist.

## Verifikation

| Zustand | Guard | Beleg |
|---|---|---|
| Zeilen 45–48 vorhanden | rot, meldet genau `container-resolution-and-unattended-worktree.bats:47` | gemessen 2026-08-09 |
| Zeilen 45–48 entfernt | grün | gemessen 2026-08-09 (temporäre Probe, zurückgerollt) |
| betroffener Test ohne Vorbedingung | 3/3 grün | gemessen 2026-08-09 |

Keine der sechs legitimen Fundstellen (drei Fixture-Zeilen in `factory-branch-switch-guard.bats`,
je eine in `agent-lock-main-checkout-reclaim.bats` und `worktree-create.bats`, eine
Kommentarzeile in `pr-refresh.bats`) wurde gemeldet.
