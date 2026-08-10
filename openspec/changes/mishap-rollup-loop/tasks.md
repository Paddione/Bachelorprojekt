---
title: "mishap-rollup-loop — Implementation Plan"
ticket_id: T002931
domains: [factory, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-rollup-loop — Implementation Plan

_Ticket: T002931_

Ziel: Der Branch `chore/mishap-incident-rollup` traegt nach jedem Generator-Lauf
**genau einen** eigenen Commit ueber seiner Basis, und der Remote-Tip **bewegt sich**,
statt zu wachsen. Die Ursachenlage steht im Proposal; die dort gemessenen Fakten werden
hier nicht wiederholt, sondern vorausgesetzt.

## File Structure

```
scripts/factory/rollup-publish.sh                                   (neu, ~90 Zeilen)
scripts/factory/mishap-rollup.sh                                    (geaendert, 311 Zeilen, .sh-Limit 800)
tests/spec/mishap-rollup/rollup-branch-progress.bats                (neu)
tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats (geaendert, 69 Zeilen)
openspec/changes/mishap-rollup-loop/specs/mishap-rollup.md          (bereits geschrieben)
```

S1-Budget (`.sh`-Limit 800, keine der Dateien ist in `docs/code-quality/baseline.json`
erfasst, wirksame Schwelle = Limit): `mishap-rollup.sh` 311/800 — Reserve 489; die
Auslagerung nach `rollup-publish.sh` verkleinert sie zusaetzlich. Kein Budgetdruck,
kein Split noetig.

## Partials

| # | Rolle | Zieldateien |
|---|---|---|
| p1 | Test | `tests/spec/mishap-rollup/rollup-branch-progress.bats`, `tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats` |
| — | (Fix und Anbindung liegen im selben Partial, weil `rollup-publish.sh` und der Aufrufer in `mishap-rollup.sh` nur zusammen ein lauffaehiges Verhalten ergeben) | `scripts/factory/rollup-publish.sh`, `scripts/factory/mishap-rollup.sh` |

Ein Partial. Der Vorgang ist ein Fix mit einer Verhaltensaussage; eine Aufteilung
erzeugte nur eine Zwischenstufe, in der der Test gegen ein Skript ohne Aufrufer laeuft.

## Task 1 — Failing-Test-Step (RED)

Neue Datei `tests/spec/mishap-rollup/rollup-branch-progress.bats`. Sie faehrt
**ausschliesslich** gegen ein Wegwerf-Repo unter `$BATS_TEST_TMPDIR`: ein bare-Repo als
`origin`, ein Arbeits-Clone als Worktree. Weder ein Factory-Tick noch der lebende
Branch `chore/mishap-incident-rollup` noch der laufende Checkout werden beruehrt — das
ist zugleich die Bedingung aus `tests/spec/ci-cd/bats-no-live-branch-assertion.bats`
(kein `git rev-parse --abbrev-ref HEAD` gegen `$REPO_ROOT`).

Pruefmodus im Dateikopf notieren: **Command-Output-Verifikation** (T002448-M4). Der Test
ruft `scripts/factory/rollup-publish.sh` AUS und misst Exit-Code und Commit-Zustand des
Wegwerf-Repos. Kein `grep` auf den Quelltext des Skripts.

Die Zusicherungen haengen an der **Semantik**, nicht an der Darstellung (T002716):
verglichen werden Commit-SHAs, `git rev-list --count` und Exit-Codes — nicht der
Wortlaut einer Meldung und keine Laufzeit in Sekunden.

Vier `@test`-Bloecke, jeder mit eigenem Positiv-Anker (T002356-M1):

1. **Erstlauf publiziert.** Positiv-Anker: `rollup-publish.sh --help` laeuft mit Exit 0
   und gibt Text aus (das Werkzeug existiert ueberhaupt). Zusicherung: nach dem ersten
   Lauf existiert `origin/<branch>`, und `git rev-list --count <base>..origin/<branch>`
   ist `1`.
2. **Zweiter Lauf rueckt vor, statt anzuhaengen** — das ist die Kernaussage des Tickets.
   Positiv-Anker: der Lauf endet mit Exit 0 und der Remote-Branch ist ueberhaupt
   aufloesbar. Zusicherungen: der Remote-Tip-SHA nach Lauf 2 ist **ungleich** dem nach
   Lauf 1, UND `rev-list --count` ist weiterhin `1`. Beides zusammen — ein blosses
   „SHA hat sich geaendert" waere auch beim heutigen Anhaengen erfuellt, ein blosses
   „Count == 1" auch bei einem No-op.
3. **Unveraenderter Inhalt ist ein No-op.** Positiv-Anker: der vorangehende Lauf hat den
   Tip nachweislich gesetzt (SHA nicht leer). Zusicherung: Exit 0 und Remote-Tip-SHA
   identisch zum Vorlauf.
4. **Fremder Commit ueberlebt.** Aufbau: ein Commit auf dem Branch, der eine Datei
   AUSSERHALB des Change-Verzeichnisses aendert und eine fremde Nachricht traegt.
   Positiv-Anker: dieser Commit ist vor dem Lauf vom Remote-Tip aus erreichbar
   (`git merge-base --is-ancestor`, Exit 0). Zusicherung: nach dem Generator-Lauf ist er
   **weiterhin** erreichbar, und `rev-list --count` ist `2` (fremd + eigen), nicht `1`.

Ausserdem in diesem Task: den bestehenden Guard
`tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats:62`
(`T002914: mishap-rollup.sh rebased gegen origin/<BRANCH>`) auf Output-Verifikation
umstellen. Er greppt heute den Quelltext von `mishap-rollup.sh` und verstiesse damit
gegen T002448-M4; nach Task 2 traefe sein Negativ-Anker zudem eine Zeile, die es nicht
mehr gibt. Die zu erhaltende Aussage aus T002914 ist nicht „das Wort `origin/${BRANCH}`
steht im Skript", sondern „ein divergierter Remote-Stand fuehrt nicht zu einem dauerhaft
abgelehnten Push". Diese Aussage gehoert als fuenfter Block in die neue Datei:
Remote-Branch bekommt einen Commit, den der lokale Stand nicht kennt; der
Generator-Lauf muss danach trotzdem mit Exit 0 publizieren. Der alte Grep-Block
entfaellt.

Syntax-Pruefung der neuen Datei mit `--count`, **nicht** mit `bash -n` (CLAUDE.md:
`@test` ist keine gueltige Bash-Syntax):

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/mishap-rollup/rollup-branch-progress.bats
```

Der Lauf selbst — beide Formen erfassen, Sammeldatei UND Verzeichnis (T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup*
# expected: FAIL (red — scripts/factory/rollup-publish.sh existiert noch nicht)
```

## Task 2 — Fix-Step (GREEN)

**2a — `scripts/factory/rollup-publish.sh` (neu).** Ein eigenstaendiges, aufrufbares
Skript statt einer Funktion in `mishap-rollup.sh`: nur so kann der Test es gegen ein
Wegwerf-Repo fahren, ohne Datenbank, `ticket.sh` oder Factory-Kontext zu benoetigen.
Genau daran scheitert heute jede Absicherung dieses Verhaltens.

Signatur (aus dem Test heraus entworfen):

```
Usage: rollup-publish.sh --repo <pfad> --branch <name> --change-dir <relpfad> --message <text>
       rollup-publish.sh --help
Exit: 0 = publiziert oder No-op | 1 = Fehler
```

Ablauf:

1. `git add <change-dir>`. Ist der Index leer (`git diff --cached --quiet`) UND
   entspricht `HEAD` bereits einem eigenen Generator-Commit, dann No-op mit Exit 0 —
   ohne Push, ohne Amend.
2. **Eigentuemer-Pruefung von `HEAD`.** Als eigen gilt ein Commit nur, wenn BEIDES
   zutrifft: seine Betreffzeile entspricht dem Generator-Muster, UND
   `git diff-tree --no-commit-id -r --name-only HEAD` liefert ausschliesslich Pfade
   unterhalb `<change-dir>`. Die zweite Bedingung ist die tragende — eine Nachricht
   laesst sich versehentlich reproduzieren, eine Pfadmenge nicht.
3. Eigen → `git commit --amend`; fremd (oder `HEAD` == Basis) → `git commit` (neu).
4. Push: `git push --force-with-lease=<branch>:<erwarteter-remote-sha>` mit explizit
   benanntem Erwartungswert statt der impliziten Form. Die implizite Form vergleicht
   gegen die lokale Remote-Tracking-Ref, die ein vorangegangener `fetch` still
   aktualisiert haben kann — dann greift der Schutz nicht mehr. Beim Neu-Commit-Fall
   (fremder Tip) genuegt ein normaler Push.
5. Schlaegt der Push wegen der Lease fehl (Remote ist weitergelaufen): `git fetch`,
   `git rebase origin/<branch>`, erneut versuchen — der Pfad aus T002914 bleibt damit
   als Konfliktbehandlung erhalten. Scheitert auch das, Exit 1 mit einer Meldung, die
   sagt WO der Stand liegt (lokal committet, nicht auf origin).

Alle `git`-Aufrufe innerhalb dieses Skripts mit `-c core.hooksPath=/dev/null` — die
Begruendung aus T002913 gilt unveraendert, und der Generator braucht die Hooks nicht.

**2b — `scripts/factory/mishap-rollup.sh` anpassen.** Der Block „Commit + Push
(verketten)" ruft `rollup-publish.sh` auf und behaelt nur noch die Fehlerbehandlung samt
der T002817-Diagnose (staged-but-uncommitted). Der Vorab-Rebase-Aufruf
(`rollup_rebase_onto_remote` vor der Plan-Erzeugung) entfaellt: er existiert allein, um
eine wachsende Kette anschlussfaehig zu halten, und diese Kette gibt es nach 2a nicht
mehr. Die Funktion selbst wandert als Konfliktbehandlung nach `rollup-publish.sh`
(Schritt 5) und verschwindet damit nicht.

Danach muss der Lauf aus Task 1 gruen sein:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup*
```

## Task 3 — Bestandsschutz: die uebrigen Rollup-Guards

Die drei weiteren Dateien, die `mishap-rollup.sh` beruehren, muessen unveraendert gruen
bleiben — sie decken Container-Aufloesung, Selbstheilung und Heredoc-Substitution ab und
duerfen von der Umstellung nicht mitgerissen werden:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup tests/spec/mishap-bundle tests/spec/ci-cd
```

Der Guard `tests/spec/ci-cd/bats-no-live-branch-assertion.bats` ist hier der wichtigste:
er faellt, sobald die neue Testdatei den Branch des laufenden Checkouts liest.

## Task 4 — Final Verification

Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusaetzlich die Inventar-Regeneration, weil eine Testdatei hinzukommt und CI die
committete Fassung gegen den Neulauf vergleicht:

```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json
```

Und die OpenSpec-Validierung des Change-Verzeichnisses:

```bash
task openspec:validate
```
