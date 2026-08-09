# Proposal: workflow-self-trigger

## Why

Ein Workflow mit `push.paths`, der seine eigene Datei nicht in dieser Liste führt, läuft nach
einer Änderung an sich selbst nicht an. Der Fix liegt auf `main` und wirkt trotzdem nicht — ohne
Fehlermeldung, weil schlicht kein Lauf stattfindet.

Nachweislich zweimal eingetreten. Zuletzt bei T002837: der Merge-Commit `f813fec4b` löste acht
Workflow-Runs aus, „Render Fleet Artifact" war nicht darunter, obwohl der Commit genau dessen
Workflow-Datei änderte. Das Artefakt blieb veraltet und Flux rollte den alten Stand weiter aus.
Zuvor schon einmal bei T002156/T002157 — der Warnkommentar dazu steht bis heute unmittelbar über
der lückenhaften Pfadliste. T002157 nahm damals die Render-Skripte auf, die Workflow-Datei selbst
aber nicht.

## What

Die vier abweichenden Workflows — `render-fleet-artifact`, `build-brett`, `build-docs` und
`brain-merge-hook` — nehmen ihre eigene Datei in `push.paths` auf. Sieben weitere Workflows
handhaben es bereits so; es geht also um die Angleichung an eine gelebte Konvention, nicht um
eine neue Regel.

Ein BATS-Guard (`tests/spec/ci-cd/workflow-self-trigger.bats`) hält sie fest und nennt bei
Verstoß die abweichenden Dateien namentlich, damit ein künftig hinzugefügter Workflow nicht
erneut daran vorbeiläuft.

Nicht im Scope: warum Flux ein fertiges Artefakt nicht pollt (eigenständig als T002869 erfasst),
sowie inhaltliche Überarbeitungen der Trigger-Pfade über die Selbst-Referenz hinaus.

_Ticket: T002868_
