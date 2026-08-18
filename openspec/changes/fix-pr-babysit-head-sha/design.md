# Design: fix-pr-babysit-head-sha

_Ticket: T012265_

## Root-Cause

`scripts/factory/pr-babysit-ticket.sh` bewertet den CI-Zustand über
`gh pr checks "$PR" --json name,state` + `ci_checks_verdict`. `gh pr checks`
aggregiert die letzte Konklusion pro Check über ALLE Commits des PRs — ohne
SHA-Bezug. Läuft CI auf dem aktuellen PR-HEAD nie (Workflow-Defekt nach Push,
Trigger-Lücke), zeigt die Liste weiter die Vorgänger-SUCCESS → verdict=green →
der Babysitter pollt endlos im grünen Zweig. Der T003225-Fall, den T012239 für
`devflow-ci-watch.sh` über die check-runs-API des `headRefOid` löste.
Sekundärbefund 2 aus T012239.

## D-Entscheidungen

**D1 — Bewertungsquelle angleichen, Loop behalten.** `_has_red` und
`_red_or_pending_checks` lesen `gh pr view "$PR" --json headRefOid` und werten
die check-runs-API des PR-HEAD aus (`filter=latest`, conclusions
failure/timed_out = rot) — dieselbe Quelle wie `devflow-ci-watch.sh`. Kein
Duplikat von `devflow-ci-watch.sh` bauen: nur die Quelle wechselt, der
Poll-Loop, das Auto-Merge-Queuing und der Fix-Subagenten-Pfad bleiben.

**D2 — „CI lief nie"-Signal.** `total_count == 0` auf dem HEAD ist ein eigener
Zustand: sofortiges Signal (Meldung `ci-never-ran` auf stderr + Exit 2,
analog zum bestehenden empty-Verhalten) statt des grünen Polls — der PR kann
durch Pollen nie grün werden.

**D3 — Fail-soft.** Schlägt der headRefOid-/check-runs-Call fehl, gilt der
bisherige empty-Pfad (MAX_EMPTY_ROUNDS → Exit 2 mit Rebase-Hinweis) — kein
Abbruch der Factory-Kette durch gh-Ausfall.

**D4 — Non-Goals:** T012264 (Scanner-Scan), T012266 (opencode-exec),
T012267 (GitLab), alle T012263-Themen.

## Edge-Cases

- **Vorgänger-grün + HEAD-Runs vorhanden:** check-runs des HEAD sind die
  Wahrheit — grün bleibt grün, rot wird sichtbar (vorher unsichtbar).
- **Re-Run auf demselben HEAD:** `filter=latest` → nur der neueste Run je
  Check zählt (T003224-Semantik wie in devflow-ci-watch.sh).
- **empty-Verdict aus `ci_checks_verdict`:** entfällt nicht — `gh pr checks`
  wird für die Übersicht weiter genutzt, aber das Urteil kommt vom HEAD.

## Tests

`tests/spec/software-factory/pr-babysit-ci-never-ran.bats` — gh-Stub mit
Vorgänger-SUCCESS-Liste; Positiv-Anker: HEAD mit Runs + MERGED → exit 0 ohne
Signal; Negativtest (RED): `total_count=0` + OPEN → vor Fix timeout im grünen
Poll, nach Fix frühzeitiger Exit mit ci-never-ran-Signal.
