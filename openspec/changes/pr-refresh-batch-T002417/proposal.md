# Proposal: pr-refresh-batch-T002417

## Why

`scripts/pr-refresh.sh` (T002413) sollte einen Stapel konfliktbehafteter PRs in einem Aufruf abräumen — `task pr:refresh -- 3448 3446 3442`. Real verarbeitete es nur den **ersten**: jeder Guard beendete per `_die` das gesamte Skript mit Exit 1, die restlichen Nummern wurden nie betrachtet.

Das ist kein Randfall. Beim ersten realen Einsatz hingen **drei von vier** CONFLICTING-PRs an ausgecheckten Worktrees, wurden also von Guard 4 abgelehnt. Der Nutzer musste jeden PR einzeln durchprobieren — erst dabei zeigte sich, dass 3442 heilbar war. Der dokumentierte Sammelaufruf war damit praktisch unbenutzbar.

## What

- `_reject` neben `_die`: gibt dieselbe Meldung aus, beendet aber nur die Bearbeitung **eines** PR (`return 1`) statt des Laufs.
- `process_pr` liefert eine Bilanz-Kategorie statt nur Erfolg/Misserfolg: `0` geheilt, `1` abgelehnt, `2` übersprungen. Die dritte Kategorie ist nötig, damit ein bereits mergebarer PR („nichts zu tun") nicht als Heilung gezählt wird.
- Alle Guards (1–4), der PR-Abruf und die Fehlerpfade in `_refresh_branch` auf `_reject` umgestellt.
- `main()` zählt mit und gibt am Ende eine Bilanzzeile aus. Exit-Code bleibt `1`, sobald mindestens einer abgelehnt wurde — Automatisierung übersieht die Ablehnung also nicht.
- Der Aufruf in der Schleife lautet `rc=0; process_pr "$n" || rc=$?`. Unter `set -euo pipefail` würde ein nackter Aufruf bei Rückgabewert ≠ 0 den Lauf beenden — also genau das Verhalten, das dieser Vorgang abstellt, nur an anderer Stelle.
- Scheitert `rebase --continue`, wird der temporäre Worktree jetzt entfernt. Im Sammellauf ist das Pflicht, nicht Kosmetik: ein stehengebliebener Worktree hält den Branch ausgecheckt, und Guard 4 würde denselben PR beim nächsten Versuch ablehnen, obwohl nur dieser eine Lauf gescheitert ist.

## Impact

- Verhaltensänderung am Exit-Code: bisher `0` bei „nichts zu tun", jetzt `0` genau dann, wenn **kein** PR abgelehnt wurde. Der Einzelaufruf verhält sich unverändert.
- Header und `--help` dokumentieren das Sammellauf-Verhalten.

_Ticket: T002417_
