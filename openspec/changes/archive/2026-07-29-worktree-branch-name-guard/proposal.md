# Proposal: worktree-branch-name-guard

## Why

`scripts/worktree-create.sh` legt Worktrees für Branch-Namen an, die `.githooks/pre-commit`
anschließend bei jedem Commit ablehnt. Der Fehler tritt dadurch maximal weit von seiner Ursache
entfernt auf: der Worktree steht, der Anker-Commit (T002412) läuft mit `--no-verify` und wirkt
wie ein funktionierender Branch, und erst der erste inhaltliche Commit scheitert.

Gemessen am 2026-07-29 tragen 4 von 13 aktiven Worktrees einen solchen Branch
(`chore/mishap-t002407|424|429`, `feature/t2450-loc-gates-headroom`), dazu der `plan_ref`-Branch
von T002409 selbst.

Der Fehler ist ein Wiederholungstäter. T002240 war derselbe Bug und wurde ausschließlich in
`scripts/factory/auto-chore-plan.sh` behoben; T002409 Mishap 2 meldete ihn erneut für das Präfix
`feat/`. Beide Korrekturen saßen beim Aufrufer — mindestens sieben Aufrufer bauen ihren
Branch-Namen jedoch selbst, und die Regel steht nur im Hook, der zuletzt läuft.

## What

Ein Fail-fast-Guard in `scripts/worktree-create.sh`, dem einen Punkt, den alle Aufrufer passieren.
Er sitzt unmittelbar nach `set -euo pipefail` und damit **vor** dem Divergence-Guard, der heute
bereits `git stash` und `git pull` ausführt, bevor die Argumente überhaupt geprüft wurden.

Bei einem konventionswidrigen Namen: Exit ungleich null, keine Mutation, kein Verzeichnis. Die
Meldung benennt jede verletzte Bedingung einzeln und schlägt, wo ableitbar, den korrigierten
Aufruf vor. Exemptions und Muster stammen wörtlich aus dem Hook; Bypass über
`WT_SKIP_NAME_CHECK=1`.

Eine automatische Korrektur wurde verworfen: sie ließe den Aufrufer divergieren, weil dieser den
Branch-Namen anschließend für Commit und Push weiterverwendet.

Die Regel steht danach bewusst an zwei Stellen. Eine gemeinsame Lib in `scripts/lib/` würde dem
`pre-commit`-Hook seine erste Abhängigkeit auf eine Repo-Datei geben — fehlt sie, scheitert jeder
Commit. Stattdessen sichern drei Drift-Tests die Übereinstimmung von Muster, Exemption-Liste und
Präfix-Menge.

_Ticket: T002470_
