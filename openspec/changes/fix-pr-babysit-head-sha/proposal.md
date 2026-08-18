# Proposal: fix-pr-babysit-head-sha

## Why

`scripts/factory/pr-babysit-ticket.sh` bewertet den CI-Zustand über
`gh pr checks --json name,state` — die aggregierte, SHA-lose Liste. Läuft CI
auf dem aktuellen PR-HEAD nie, zeigt die Liste die Vorgänger-SUCCESS, der
Babysitter pollt endlos im grünen Zweig und signalisiert implizit "ok". Der
T003225-Fall, den T012239 für `devflow-ci-watch.sh` über die check-runs-API
des `headRefOid` löste. Sekundärbefund 2 aus T012239.

## What

`_has_red`/`_red_or_pending_checks` werten statt der aggregierten Liste die
check-runs-API des PR-HEAD aus (`filter=latest`, failure/timed_out = rot).
`total_count == 0` auf dem HEAD → sofortiges ci-never-ran-Signal (Exit 2)
statt des grünen Polls. Fail-soft: bei gh-Ausfall greift der bestehende
empty-Pfad. Loop, Auto-Merge-Queuing und Fix-Subagenten-Pfad bleiben
unverändert.

_Ticket: T012265_
