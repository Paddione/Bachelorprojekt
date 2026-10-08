# Proposal: Flake pi-harness changed_files-Test (T901070)

## Symptom (Fakt)
`tests/spec/pi-harness.bats` — `@test "changed_files zaehlt nur, was der Lauf
selbst geaendert hat"` — schlug in CI-Run 37661187844 (PR #6291, Spec-Shard 1)
fehl, lokal 3/3 gruen. Haeufigkeit: 1 Treffer in den letzten 40 roten CI-Laeufen
(Messbefehl siehe Ticket). Flake-Repro wird nicht erzwungen; Code-Inspektion +
deterministischer RED-Test (Stub schreibt parallelen Schreiber) genuegen.

## Hypothese (verifiziert per Inspektion)
`scripts/pi-run.sh:130-135` (`dirty_snapshot`) vergleicht `git status
--porcelain` des **gesamten REPO_ROOT-Arbeitsbaums** vorher/nachher
(`:315` vor, `:322` nach dem `pi`-Aufruf). REPO_ROOT kommt aus dem Skriptpfad
(`:31`) und ist im Test der echte Checkout. Unter `bats -j` schreiben parallele
Testdateien in denselben Baum (eigene `.pi/runs`-Logs sind per `.gitignore:261`
ausgenommen, aber alles andere Untracked/Modified nicht) — der Vorher/Nachher-
Vergleich zaehlt sie mit. Erwartet `1` (nur die Stub-Probe-Datei), gelesen `>1`.

Zusatzbefund: Der Test selbst schreibt seine Probe-Datei mitten in den echten
Checkout (`PI_STUB_TOUCH="${REPO_ROOT}/pi-probe-..."`, bats `:218`) — kein
Isolations-Defekt des Skripts allein, sondern fehlende Test-Naht.

## Fix-Richtung (Ticket-Vorgabe, per Skill entschieden)
Naht statt Kopie: `PI_WORKTREE="${PI_WORKTREE:-$REPO_ROOT}"` als Test-Naht in
`dirty_snapshot` (Default-verhalten identisch, kein Prod-Verhaltenswechsel);
Tests setzen `PI_WORKTREE` auf ein frisches Temp-Git-Repo und lassen Stub-Probe
dort entstehen. Parallele Schreiber im echten Checkout fallen aus dem Vergleich.
Volle Repo-Kopie pro Testlauf verworfen: teurer, langsamer, loest nichts, was
die Naht nicht loest.

## Pfad-Entscheidung (Schritt 0)
**Fix-Pfad.** Kein Chore: Es wird eine neue Env-Naht in einem Produktions-Skript
(`scripts/pi-run.sh`) eingefuehrt — default-erhaltend, aber verhaltensorientiert
— plus RED-Test vorab. Chore waere nur bei reiner Test-/Doku-Aenderung zulaessig.

## Kollisions-Hinweis
T900793 (`chore/omp-replaces-pi-T900793`, aktiv gelockt, Worktree
`.worktrees/omp-replaces-pi-T900793`) benennt `pi-run.sh` → `omp-run.sh` und
`pi-harness.bats` → `omp-harness.bats` um und traegt denselben Flake-Mechanismus
weiter (`dirty_snapshot` ueber vollen REPO_ROOT dort `:144`, `:341`/`:348`).
Nach deren Merge ist die Naht dorthin zu portieren (Follow-up, nicht Teil dieses
Plans). Dieser Plan zielt auf die aktuellen `pi-*`-Pfade auf `origin/main`.
