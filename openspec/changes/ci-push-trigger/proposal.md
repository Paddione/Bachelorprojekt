# Proposal: ci-push-trigger

## Why

Ein Push auf `main` erzeugt seit dem 2026-08-01 keine Workflow-Runs mehr. Weder
`ci.yml` noch die paths-filterfreien `post-merge.yml`, `freshness-regen.yml` und
`factory-post-merge-e2e.yml` laufen an — ohne Fehlermeldung.

Ursache ist der Anchor-Commit aus `scripts/worktree-create.sh`, dessen Subject
`[skip ci]` enthält. Beim Squash-Merge faltet GitHub die Branch-Commit-Subjects
in den Body des `main`-Commits; GitHub wertet Skip-Marker gegen die gesamte
Message des Head-Commits aus und unterdrückt daraufhin alle push-getriggerten
Workflows. Belegt über 25 aufeinanderfolgende Commits: 17 mit Marker → 0 Runs,
8 ohne Marker → je 1 Run, kein Gegenfall.

Die Auswirkung ist still und deshalb gefährlich: Merge gilt als Abschluss
(T001092), das Ticket schließt, Flux meldet `Ready=True` — und der Code ist
trotzdem nicht im Cluster.

## What

- Der Anchor-Commit wird ohne Skip-Marker gesetzt. Sein Zweck (Sichtbarkeit für
  Ancestry-Prüfungen) hängt allein an der Existenz des Commits, nicht an seinem
  Text.
- Ein neuer Guard `scripts/check-skip-ci-marker.sh` prüft die Commits in
  `origin/main..HEAD` auf Skip-Marker und wird im `pull_request`-Lauf von
  `ci.yml` aufgerufen. Genau diese Subjects landen später im Squash-Body, also
  greift der Check *bevor* gemergt wird.

Details, verworfene Alternativen und Edge-Cases: `design.md`.

_Ticket: T002522_
