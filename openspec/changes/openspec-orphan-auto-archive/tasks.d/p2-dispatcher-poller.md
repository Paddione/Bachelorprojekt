## p2 — Dispatcher und Poller-Aufgabe `archive`

Target files: `scripts/factory/openspec-orphan-dispatch.sh`, `scripts/factory/github-poller.sh`

Requirement: sdlc-isolation „The local poller dispatches archiving of orphaned OpenSpec changes".
`scripts/factory/github-poller.sh` hat 216 Zeilen, Restbudget 584; die Aenderung bleibt unter
20 Zeilen. Der Dispatcher ist eine neue Datei (Richtwert unter 150 Zeilen).

- [ ] **Dispatcher `scripts/factory/openspec-orphan-dispatch.sh` anlegen.**
  `source "$HERE/lib.sh"` und `factory_resolve` wie im Poller; Optionen `--dry-run`,
  `--min-age-hours N` (Default 2), `-h|--help`. Repo-Pfad fuer `gh api`: `repos/{owner}/{repo}`
  (gh ersetzt die Platzhalter aus dem aktuellen Repo).
  1. Laeuft oder wartet schon ein Run: `gh run list --workflow openspec-orphan-archive.yml
     --status in_progress` und `--status queued` (je `--json databaseId --jq '.[].databaseId'`).
     Liefert eine davon etwas: `archive run already active — no dispatch` ausgeben, Exit 0.
  2. Offene Slugs: `gh api 'repos/{owner}/{repo}/contents/openspec/changes?ref=main'
     --jq '.[] | select(.type=="dir" and .name!="archive") | .name'`. Scheitert der Aufruf:
     Meldung auf stderr, Exit 1 (Poller haelt dann seinen rc).
  3. Je Slug, in dieser Reihenfolge, beim ersten Treffer `skip <slug>: <grund>` ausgeben:
     - `.ticket` via `gh api 'repos/{owner}/{repo}/contents/openspec/changes/<slug>/.ticket?ref=main'
       --jq .content | base64 -d | tr -d '[:space:]'`; leer oder Fehler: Grund `no .ticket`.
     - Status via `factory_psql -c "SELECT status FROM tickets.tickets WHERE external_id = '<Tid>'"`;
       leer: `ticket <Tid> not found`; nicht `done`: `ticket <Tid> is <status>`.
     - Einfuehrungs-Commit: `gh api 'repos/{owner}/{repo}/commits?sha=main&path=openspec/changes/<slug>&per_page=100'
       --jq '.[-1].commit.committer.date'`; juenger als `--min-age-hours`: `too young (<h>h)`.
     - Offener PR mit Slug im Titel: `gh pr list --state open --search '<slug> in:title'
       --json title --jq '.[].title'`; nicht leer: `open pull request`.
     - Sonst `select <slug> (<Tid>)` ausgeben und merken.
  4. Mindestens ein Slug gewaehlt: ohne `--dry-run` genau einmal
     `gh workflow run openspec-orphan-archive.yml -f slugs=<a,b,...>` und
     `dispatched: <a,b,...>` ausgeben; mit `--dry-run` nur `[dry-run] would dispatch: <...>`.

- [ ] **Poller-Aufgabe `archive` in `scripts/factory/github-poller.sh`.**
  - Kopfkommentar: vierte Aufgabe `archive   verwaiste OpenSpec-Changes -> workflow_dispatch
    (delegiert an openspec-orphan-dispatch.sh)` in die Aufgabenliste.
  - Funktion `task_archive()` nach dem Muster von `task_merges()`: `echo "== archive =="`,
    Dispatcher mit durchgereichtem `--dry-run` aufrufen, Fehler mit Meldung auf stderr und
    `return 1`. Kein Cursor: der Dispatcher ist zustandslos und idempotent (D6).
  - `case "$ONLY_TASK"`: Zweig `archive)` ergaenzen, im Default-Zweig `task_archive || rc=$?`
    nach `task_prs` anhaengen, Fehlermeldung auf `(merges|prs|archive)` erweitern.

- [ ] **Dispatcher-Tests gruen.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/orphan-archive-dispatch.bats tests/spec/sdlc-isolation/e3-poller.bats
# expected: alle ok (e3-poller.bats als Regression fuer die bestehenden Aufgaben)
```
