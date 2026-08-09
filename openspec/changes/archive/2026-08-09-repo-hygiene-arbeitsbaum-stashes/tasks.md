---
title: "repo-hygiene-arbeitsbaum-stashes — Implementation Plan"
ticket_id: T002709
domains: [bachelorprojekt-infra, plan-authoring]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# repo-hygiene-arbeitsbaum-stashes — Implementation Plan

## File Structure

```
tests/spec/repo-hygiene/worktree-stash-inspection.bats   (neu)   Guard, RED zuerst
.claude/skills/references/repo-hygiene-ops.md            (geändert) neuer §0 vor §1
.claude/skills/repo-hygiene/SKILL.md                     (geändert) Ablaufliste + §0
.claude/skills/references/SKILL.md                       (geändert) Beschreibungszeile
website/src/data/test-inventory.json                     (generiert) task test:inventory
```

## Partials

| # | Rolle | Zieldateien |
|---|-------|-------------|
| 1 | tests + docs | alle oben genannten Dateien |

Ein Partial. Der Vorgang ist eine Doku-Erweiterung plus genau einen Guard; die Aufteilung in
disjunkte Partials brächte hier nur Koordinationsaufwand ohne Parallelisierungsgewinn.

## S1-Zeilenbudgets

Ermittelt am 2026-08-09 im Worktree. `docs/code-quality/gates.yaml` → `s1.limits` listet Limits
für `.astro .ts .svelte .sh .mjs .mts .py .js .jsx .tsx .cjs .bash .java .php` — **weder `.md`
noch `.bats`**. Alle berührten Dateien sind Markdown oder BATS, keine ist in
`docs/code-quality/baseline.json` erfasst (`jq -r '."S1:<pfad>".metric // "nicht-baselined"'`
lieferte für jede `nicht-baselined`). S1 ist für diesen Vorgang damit nicht bindend; ein
Zeilenbudget ist trotzdem notiert, damit der Abschnitt nicht ausufert:

| Datei | Ist | S1-Schwelle | Selbstauflage |
|---|---|---|---|
| `.claude/skills/references/repo-hygiene-ops.md` | 215 | nicht gegated | neuer §0 höchstens ~70 Zeilen |
| `.claude/skills/repo-hygiene/SKILL.md` | 55 | nicht gegated | +2 Zeilen |
| `.claude/skills/references/SKILL.md` | 40 | nicht gegated | 1 Zeile geändert |
| `tests/spec/repo-hygiene/worktree-stash-inspection.bats` | neu | nicht gegated | unter 150 Zeilen |

Ergibt sich beim Schreiben, dass §0 die ~70 Zeilen deutlich überschreitet, wird der
Falle-2-Teil (Relevanzprüfung) in einen eigenen Unterabschnitt derselben Datei gezogen — nicht in
eine neue Datei: die Mechanik gehört als SSOT an einen Ort, das ist der Zweck von
`repo-hygiene-ops.md`.

## Task 1 (RED): Guard schreiben, der ohne den Fix rot ist

**Datei:** `tests/spec/repo-hygiene/worktree-stash-inspection.bats` (neu)

Verzeichniskonvention T002416: eigene Datei unter `tests/spec/<spec-slug>/`. Der SSOT-Parent
dieser Requirements ist `openspec/specs/agent-skills.md` — das gehört so in den Dateikopf. Das
Verzeichnis `tests/spec/repo-hygiene/` wird gewählt, weil dort bereits
`dead-path-references.bats` liegt, der dieselbe Datei prüft; `task test:spec` läuft mit
`bats -r tests/spec/` und erfasst beide.

**Prüfmodus (im Dateikopf zu dokumentieren):** Kommando-Ergebnis-Verifikation. Es wird **nicht**
gegen Ausgabeformate von `git` assertiert — kein Fehlertext, kein Diff-Header, keine
Zeilenzählung eines Werkzeug-Outputs. Geprüft wird, welche Inhalte ein Kommando liefert und ob
eine Entscheidung dadurch auflösbar wird. Begründung: Format-Assertionen gegen Werkzeuge sind der
Gegenstand von T002716 und hier ausdrücklich unerwünscht.

Drei Blöcke, jeder mit vorangestelltem Positiv-Anker (T002356-M1):

1. **`§0 existiert und steht vor §1`** — Positiv-Anker: `grep -c '^## '` auf
   `repo-hygiene-ops.md` liefert einen Wert `>= 5` (die Datei hat überhaupt Abschnitte). Dann:
   die Zeilennummer des Arbeitsbaum/Stash-Abschnitts ist kleiner als die von
   `## 1. Stale Git Worktrees`. Dieser Block ist der eigentliche RED-Anker gegen die Doku.

2. **`Pfadgefilterte Inspektion liefert das richtige Resultat`** — die dokumentierte Befehlsform
   wird **aus der realen Datei extrahiert** (Kandidatenzeilen mit `git diff` und `stash@{`).
   Positiv-Anker: die Kandidatenliste ist nicht leer. Dann wird in einem Wegwerf-Repo unter
   `$BATS_TEST_TMPDIR` ein Stash erzeugt, der zwei Dateien mit je einem eindeutigen Marker
   ändert, die extrahierte Form darauf angewandt und das **Resultat** ausgewertet: Exit 0, Marker
   der gefilterten Datei enthalten, Marker der zweiten Datei nicht enthalten.

3. **`Relevanz löst sich nur gegen main auf`** — im selben Wegwerf-Repo: der Stash-Diff wird
   einmal vor und einmal nach dem Landen des Inhalts auf `main` erhoben. Positiv-Anker: der Diff
   ist nicht leer. Aussage: beide Erhebungen sind **identisch** — der Stash-Diff trägt also kein
   Relevanzsignal. Danach die dokumentierte Marker-Prüfung gegen `main`: vor dem Commit nicht
   gefunden, nach dem Commit gefunden. Damit ist als Resultat belegt, dass die empfohlene Methode
   die Entscheidung auflöst und die naheliegende falsche es nicht tut.

Alle Wegwerf-Repos mit `git -c user.email=… -c user.name= … init` in `$BATS_TEST_TMPDIR`
anlegen und mit `git -C` ansprechen — kein `cd` in das Repo des Laufs, keine Berührung des echten
Stash-Stacks.

**Verifikation (erwartet ROT):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-hygiene/worktree-stash-inspection.bats
# expected: FAIL — §0 existiert noch nicht, Block 1 fällt und Block 2 findet keine
# Kandidatenzeile, sein Positiv-Anker fällt damit ebenfalls.
```

## Task 2 (GREEN): §0 in `repo-hygiene-ops.md` schreiben

**Datei:** `.claude/skills/references/repo-hygiene-ops.md`, neuer Abschnitt
`## 0. Arbeitsbaum & Stashes` **vor** `## 1. Stale Git Worktrees`. Bestehende Nummern `§1`–`§5`
bleiben unverändert (Begründung im Proposal: externe Verweise).

Inhalt in dieser Reihenfolge:

1. **Befund im Hauptcheckout.** `git -C <main-checkout> status --porcelain` — nicht leer ist ein
   Befund, kein Rauschen. Pro Änderung entscheiden: gehört sie zu einem laufenden Ticket
   (→ in dessen Worktree), oder ist es ein funktionaler Patch ohne Ticket (→ Ticket anlegen und
   Worktree, **nicht** verwerfen)? Der reale Auslöser gehört als Beleg dazu: der ungetickte Patch
   an `scripts/bge-mcp/server.mjs` vom 2026-08-08.

2. **Stash-Inventar.** `git stash list` mit Datum, damit Alter sichtbar ist.

3. **Falle 1 — pfadgefilterte Inspektion.** Als Warnblock:
   `git stash show -p "stash@{N}" -- <pfad>` scheitert; brauchbar ist
   `git diff "stash@{N}^" "stash@{N}" -- <pfad>`. Der Grund gehört in einen Halbsatz, damit die
   Regel nicht als Aberglaube gelesen wird: `stash show` nimmt genau eine Revision entgegen, die
   Pfadangabe wird als zweite gelesen.

4. **Falle 2 — Relevanz entscheiden.** Als Warnblock: der Stash-Diff gegen den eigenen
   Basiscommit sieht **immer** ungemergt aus und beantwortet die Frage nicht. Maßgeblich sind die
   konkreten Marker aus dem Stash-Diff, gesucht im heutigen `main` (`git grep -F <marker>
   origin/main -- <pfad>`). Beleg: die drei Stashes vom 2026-08-08 waren über Commit `0a2493ffd`
   längst in `main`, ihr eigener Diff zeigte das nicht.

5. **Fail-Closed-Regel.** Lässt sich ein Marker nicht bilden oder die Prüfung nicht abschließen
   (leere Antwort, Fehler): Stash **behalten**. Eine leere Antwort ist kein Urteil — dasselbe
   Muster, das §3 bereits für `mergedAt` festhält.

Anschließend `.claude/skills/repo-hygiene/SKILL.md`: „die fünf Abschnitte" → „die sechs
Abschnitte", und `0. **Arbeitsbaum & Stashes** — §0` als ersten Listenpunkt vor
`1. **Stale Git Worktrees** — §1`. Sowie `.claude/skills/references/SKILL.md`: die
Beschreibungszeile der Referenz um Arbeitsbaum/Stashes ergänzen.

**Verifikation (erwartet GRÜN):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-hygiene/worktree-stash-inspection.bats
```

## Task 3: Test-Inventar regenerieren

Eine neue Datei unter `tests/spec/` muss im Inventar erscheinen, sonst schlägt der
CI-Job fehl, der `task test:inventory` nachrechnet und gegen die committete Version diffed.

Der Stage-Commit enthält das Inventar bereits regeneriert (der Guard aus Task 1 liegt darin).
Dieser Task ist daher eine Nachziehpflicht: Sobald an der Testdatei etwas geändert wird —
ein umbenannter `@test`-Titel genügt — muss er erneut laufen.

```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json   # muss den neuen Eintrag zeigen
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Guard aus Task 1 existiert und ist auf dem Branch rot,
      bevor Task 2 läuft.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-hygiene/worktree-stash-inspection.bats
# expected: FAIL (rot — §0 ist noch nicht geschrieben)
```

- [ ] **Fix-Step (GREEN).** Nach Task 2 ist derselbe Aufruf grün.

- [ ] **Nachbarschaft nicht beschädigt.** Beide Formen der Spec-Tests laufen lassen, nicht nur
      die neue Datei — die Lektion aus T002696/T002657: eine gezielte Suche nach
      `tests/spec/<spec>.bats` findet nur die Hälfte.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/repo-hygiene tests/spec/agent-skills*
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-chore-ticket-ops-mishaps.bats
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
