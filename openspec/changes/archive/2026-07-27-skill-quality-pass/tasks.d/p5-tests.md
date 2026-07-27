# p5 — Tests: description-Präsenz, Zeilenbudget, Vendor-Sektion

**Rolle:** tests · **depends_on:** p1

**target_files:** `tests/spec/agent-skills.bats`,
`tests/spec/agentic-tooling-quality-goals.bats`, `website/src/data/test-inventory.json`

Beide BATS-Dateien existieren bereits und werden erweitert — keine neuen Dateien anlegen, das
entspricht der Konvention „ein `tests/spec/<spec-slug>.bats` je SSOT-Spec". Die Zuordnung folgt
den beiden Delta-Specs dieses Changes: Regeln über den Skill-Satz gehören zu `agent-skills`,
Regeln über die Gate-Semantik zu `agentic-tooling-quality-goals`.

Der in `p1` eingefrorene Extraktionsbefehl für die Vendor-Liste wird hier wortgleich verwendet.

## Task 5.1 — Failing-Test-Step (RED)

Die neuen `@test`-Blöcke aus Task 5.2 und 5.3 zuerst schreiben und gegen den **unveränderten
Ausgangsstand** ausführen. Sind `p1` bis `p4` im Arbeitsbaum bereits angewandt, wird der
Rot-Nachweis in einem separaten Worktree auf `origin/main` geführt:

```bash
git worktree add /tmp/k4-red origin/main
cp tests/spec/agent-skills.bats tests/spec/agentic-tooling-quality-goals.bats /tmp/k4-red/tests/spec/
cd /tmp/k4-red
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats tests/spec/agentic-tooling-quality-goals.bats
# expected: FAIL
```

Erwartete Fehlschläge am Ausgangsstand, jeder mit konkreter Ursache:

| Test | Warum rot |
|---|---|
| description-Präsenz | `brain-ingest` hat kein Frontmatter |
| Zeilenbudget | sechs Skills liegen über 250 Zeilen |
| Vendor-Sektion vollständig | der Marker-Block existiert noch nicht |
| keine toten Referenzen | fünf entfernte Skills werden noch genannt |
| Gate-Semantik | `G-AGENTIC09` ist `target` mit Schwelle 500 |

Danach den Worktree wieder entfernen: `git worktree remove /tmp/k4-red`.

**Akzeptanz:** Der Lauf im Ausgangsstand endet mit einem Fehlschlag pro Zeile der Tabelle. Ein
Test, der dort bereits grün ist, prüft nicht, was er zu prüfen vorgibt, und wird korrigiert.

## Task 5.2 — Tests in `tests/spec/agent-skills.bats`

Vier `@test`-Blöcke ergänzen. Alle leiten den projekteigenen Satz aus `OVERVIEW.md` ab statt eine
Namensliste zu hartkodieren — eine hartkodierte Liste wäre ein weiteres driftendes Register.

1. **Jeder aktive projekteigene Skill hat eine `description`.** Über alle getrackten `SKILL.md`
   iterieren, Vendor-Einträge überspringen, Dateien mit `archived: true` überspringen, im
   Frontmatter-Block ein `description:`-Feld verlangen. Die `archived`-Ausnahme ist Absicht und
   deckt `update-dependencies` ab.

2. **Kein projekteigener `SKILL.md` überschreitet 250 Zeilen.** Dieselbe Iteration, Prüfung per
   `wc -l`. Der Test spiegelt `G-AGENTIC09` in der PR-CI, wo `health-goals-check.sh` nicht läuft.

3. **Die Vendor-Sektion nennt jeden Vendor-Skill.** Der Extraktionsbefehl liefert genau sieben
   Namen, und zu jedem existiert ein Verzeichnis unter `.claude/skills/`. Damit schlägt der Test
   sowohl bei einem fehlenden als auch bei einem erfundenen Eintrag an.

4. **`OVERVIEW.md` nennt kein Skill-Verzeichnis, das nicht existiert.** Backtick-Namen
   extrahieren und gegen das Dateisystem prüfen. Bekannte Nicht-Skill-Namen — die sechs
   `bachelorprojekt-*`-Agenten sowie `react-bits` als dokumentierter ungetrackter Skill — werden
   in einer Ausnahmeliste im Test geführt, mit Kommentar, warum sie dort stehen.

**Akzeptanz:** `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats` läuft grün, und
jeder der vier Tests war in Task 5.1 rot.

## Task 5.3 — Test in `tests/spec/agentic-tooling-quality-goals.bats`

Einen `@test` ergänzen, der die neue `G-AGENTIC09`-Semantik in `scripts/health-goals-check.sh`
festhält: Der Block ist als `row gate` deklariert, seine Schwelle ist 250, und er liest die
Vendor-Liste aus dem Marker-Block in `OVERVIEW.md`.

Der Test prüft die Deklaration in der Datei, nicht nur das Messergebnis — ein Gate, das
versehentlich auf `target` zurückgestuft wird, meldet weiterhin `0` und bliebe sonst unbemerkt.

**Akzeptanz:** `tests/unit/lib/bats-core/bin/bats tests/spec/agentic-tooling-quality-goals.bats`
läuft grün.

## Task 5.4 — Test-Inventar regenerieren

Die CI vergleicht `website/src/data/test-inventory.json` gegen eine frische Generierung und
schlägt bei Abweichung fehl.

```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json
```

**Akzeptanz:** Die Datei ist regeneriert und mitcommittet; ein erneuter Lauf von
`task test:inventory` erzeugt keinen weiteren Diff.
