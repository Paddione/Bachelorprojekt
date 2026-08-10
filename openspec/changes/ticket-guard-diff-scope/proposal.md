# Proposal: ticket-guard-diff-scope

## Why

Der Guard `tests/spec/openspec-workflow/ticket-file-required.bats` iteriert in
Zeile 30 über `"$REPO"/openspec/changes/*/`, also über den Gesamtbestand. Eine
einzige fehlende `.ticket`-Datei auf `main` färbt damit jeden gleichzeitig
offenen PR rot — auch PRs, die OpenSpec nicht berühren. Beobachtet am
2026-08-09: die Lücken von `fix-wakeup-help-T002662` und
`fix-update-status-planstaged-guard-T002876` kippten #3963, #3961 und #3957.

Der Schaden fächert sich über die Zahl der offenen PRs auf, und die Behebung
ebenso: nach dem Merge des Fixes muss jeder betroffene PR einzeln per
`gh pr update-branch` nachgezogen werden. #3961 fiel deshalb zweimal am selben
Guard. Bei derzeit rund zwanzig offenen Plan-Branches ist das kein Randfall
mehr, sondern der Normalzustand.

## What

Die Prüfung wandert aus der BATS-Datei in ein aufrufbares Skript
`scripts/openspec-ticket-guard.sh` mit zwei Modi:

- **PR-Gate (Default):** prüft nur die Change-Verzeichnisse, die der Branch
  gegen `origin/main` anfasst. Eine fremde Altlast kann den PR nicht mehr
  kippen.
- **`--all` (Vollbestand):** prüft jedes Change-Verzeichnis. Läuft auf
  push-to-`main` und im nächtlichen Cron von `.github/workflows/ci.yml`, damit
  der Bestand einen terminierten Eigentümer behält statt unbemerkt zu verrotten.

Die bestehende Allowlist `t002573-backlog-slugs.txt` bleibt als
`--backlog`-Parameter erhalten — sie friert den T002573-Altbestand ein und wird
durch diese Änderung nicht erweitert.

_Ticket: T002934_
