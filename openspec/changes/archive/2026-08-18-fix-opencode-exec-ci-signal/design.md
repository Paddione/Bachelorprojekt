# Design: fix-opencode-exec-ci-signal

_Ticket: T012266_

## Root-Cause

`scripts/factory/opencode-exec.sh` verifiziert nach dem Orchestrator-Lauf nur
Commit-Existenz; der PR-Schritt meldet `pr-ready` (phase-event `done`), sobald
`ensure_pr` durchläuft. Ob CI für den erzeugten PR-HEAD überhaupt lief oder
rot ist, prüft die Kette nicht — die CI-Erkennung hängt allein am
Cron-Scanner `babysit-prs.sh` (Wakeup-Tick). Zwischen Implement-Ende und
nächstem Tick liegt ein Fenster, in dem ein PR mit nie gestarteter CI als
`pr-ready` in der Telemetrie erscheint. Sekundärbefund 3 aus T012239.

## D-Entscheidungen

**D1 — Best-effort CI-Signal nach dem PR-Schritt.** Nach erfolgreichem
`ensure_pr` (state=done-Zweig): `gh pr view` auf den PR (oder die
`ensure_pr`-Ausgabe) → `headRefOid` → check-runs-API `total_count`.
`total_count == 0` → Meldung `opencode-exec: <ticket> — ci-never-ran:
PR-HEAD hat keine Check-Runs` auf stderr + `phase_event blocked orchestrator
pr-ready … ci_never_ran` statt des `done`-Events. Sonst rot/pending-Zahl als
Detail am done-Event (`ci=<n>-checks`).

**D2 — Fail-soft.** Schlägt der headRefOid-/check-runs-Call fehl (gh-Ausfall,
Rate-Limit), bleibt das bisherige done-Event — der PR-Schritt selbst ist
erfolgreich, nur das CI-Signal fehlt. Kein Abbruch der Kette.

**D3 — Kein Duplikat von babysit-prs.sh.** Der Executor gibt ein unmittelbares
Signal am Entstehungsort; die laufende Überwachung bleibt beim Scanner.

**D4 — Non-Goals:** T012264, T012265, T012267, alle T012263-Themen.

## Edge-Cases

- **CI läuft bereits (total_count > 0, IN_PROGRESS):** kein blocked-Event —
  das Signal unterscheidet nur „nie gelaufen" von „läuft/ lief".
- **TICKET_OFFLINE:** `phase_event` ist offline ein No-op — die
  stderr-Meldung bleibt das testbare Signal.
- **Orphan-Nachlauf (T011543):** der Kurzschluss-Pfad mündet in denselben
  PR-Schritt — das Signal greift für beide Wege.

## Tests

`tests/spec/software-factory/opencode-exec-ci-signal.bats` — gh/opencode-Stubs
nach dem Muster `opencode-exec-prerun-shortcircuit.bats`, Marker-Datei für
`total_count`; Positiv-Anker: `3` → keine Meldung; Negativtest (RED): `0` →
vor Fix stumm, nach Fix ci-never-ran-Meldung.
