# Proposal: fix-ci-failure-detection

## Why

`scripts/devflow-ci-watch.sh` ist das Merge-Readiness-Gate, das alle drei
Agent-Harnesse (claude, opencode, agy) über `ci-fix-loop.md` / `dev-flow-execute`
Schritt 5.5 aufrufen. Seit dem T003225-Refactor wertet es rote Checks über einen
`statusCheckRollup`-Selector mit `select(.headSha == $p.headRefOid)` aus — ein
Feld, das die gh-REST-API im Rollup nie füllt (33/33 Einträge der PRs #4734 und
#4728 tragen `headSha: null`, gemessen 2026-08-18 mit gh 2.97.0). Der Selector
liefert immer die leere Menge, `FAILED_CHECKS` bleibt immer leer, und das Skript
meldet nach Abschluss aller Checks „alle grün" mit Exit 0 — auch wenn
Check-Runs auf dem PR-HEAD `failure`/`timed_out` sind. Die Job-Level-Gegenprobe
(T003224) ist tot, weil sie nur bei nicht-leeren `FAILED_CHECKS` greift.

Damit meldet der zentrale CI-Verifikationspunkt rotes CI als grün — die Agents
„erkennen" CI-Probleme nicht, weil ihr Werkzeug sie ihnen als grün verkauft.
Belegt wurde die Fehlerklasse am selben Tag auch durch die Mishaps
(2026-08-18 02:14/02:48): dev-flow-plan-Changes ohne `specs/`-Delta und
`.ticket` machten `openspec-validate` rot, ohne dass der ausführende Agent es
bemerkte.

Zweiter Befund derselben Klasse: `scripts/factory/babysit-prs.sh` — der
repo-weite Scanner, der in der Factory die CI-Erkennung trägt — selektiert rote
PR-Kandidaten nur bei `.conclusion == "FAILURE"`. `TIMED_OUT` und `ERROR` sind
legitime Fehlkonklusionen derselben API, erzeugen aber keinen Kandidaten und
keine Notifikation.

## What

1. **`devflow-ci-watch.sh`:** `FAILED_CHECKS` kommt aus der check-runs-API des
   PR-HEAD (`commits/<headRefOid>/check-runs?filter=latest`,
   `conclusion=failure|timed_out`) statt aus dem SHA-losen Rollup. Dieselbe API,
   die das Skript bereits für `TOTAL_CHECKS` nutzt — SHA-exakt, kein cwd-git,
   Re-Runs mischen sich per `filter=latest` nicht ein. `PENDING_COUNT` bleibt
   auf dem Rollup (status-basiert, nicht SHA-abhängig). Die Job-Level-Gegenprobe
   (cancelled ≠ Codefehler) greift wieder.
2. **`babysit-prs.sh`:** Kandidaten-Filter um `TIMED_OUT` und `ERROR` erweitern.
   Nur die Selektion — Klassifikation und Fix-Loop lesen weiterhin die echten
   Logs.

Non-Goals (Follow-ups im Ticket T012239): SHA-Blindheit von
`pr-babysit-ticket.sh`, „CI lief nie"-Erkennung im Scanner, GitLab-Pipeline-Status.

_Ticket: T012239_
