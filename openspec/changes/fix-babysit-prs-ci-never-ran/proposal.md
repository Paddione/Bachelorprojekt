# Proposal: fix-babysit-prs-ci-never-ran

## Why

`scripts/factory/babysit-prs.sh` ist das repo-weite Sicherheitsnetz für PRs
außerhalb laufender Factory-Runs. Es selektiert Kandidaten nur über rote
Rollup-conclusions. Ein PR, dessen CI nie lief (keine Check-Runs auf dem
PR-HEAD), hat ein leeres oder pending-Rollup und bleibt unsichtbar: kein
Kandidat, keine Notifikation, stiller exit 0. Sekundärbefund 1 aus T012239.

## What

Nach dem Kandidaten-Nullfall scannt das Skript die PRs derselben Filterkette
ohne COMPLETED-Rollup-Eintrag, liest deren `headRefOid` und prüft die
check-runs-API (`total_count`). `total_count == 0` → `emit_notify`
`event=ci-never-ran` mit PR-Nummer. IN_PROGRESS-Checks sind explizit kein
„lief nie"-Fall. Fail-soft: bei gh-Ausfall endet der Tick wie bisher, nur mit
Diagnosezeile.

_Ticket: T012264_
