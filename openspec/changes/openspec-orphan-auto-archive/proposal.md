# Proposal: openspec-orphan-auto-archive

## Why

OpenSpec-Changes bleiben nach dem Merge unter `openspec/changes/` liegen, obwohl ihr Ticket
`done` ist. Am 2026-09-23 betraf das 8 von 8 offenen Changes (bereinigt in #5835 und #5836);
T002569 hatte zuvor schon einmal 139 aufgestaute Changes per Hand abgebaut.

**Symptom (Fakt):** Change-Verzeichnis liegt auf `main`, Ticket steht auf `done`, kein
Archiv-Commit.

**Ursache (belegt):** Ticket-Abschluss und Archivierung haengen an verschiedenen Stellen.
Den Abschluss erledigt `scripts/factory/github-poller.sh` (Aufgabe `merges`, delegiert an
`auto-close-merged.sh`) oder der Watchdog — unabhaengig von jeder Session. Archiviert wird
dagegen nur in `scripts/devflow-post-merge-finalize.sh`, also in der ausfuehrenden Session.
opencode-Laeufe und abgebrochene Sessions erreichen diesen Schritt nie. Beleg: die Timelines
von T900309, T900303, T900234 und T900226 enthalten `deploy:done` ueber
`auto: update-status done` bzw. den Watchdog, aber kein Archiv-Ereignis.

```bash
# Messung (Stand 7fbc7b774 vor der Bereinigung): Ticket-Status jedes offenen Changes
for d in openspec/changes/*/; do [ -f "$d.ticket" ] && bash scripts/ticket.sh get --id "$(cat "$d.ticket")" | jq -r .status; done
```

## What

1. **Poller-Aufgabe `archive`** in `github-poller.sh`, delegiert an
   `scripts/factory/openspec-orphan-dispatch.sh`: ermittelt ueber `gh api` die offenen Changes
   auf `main`, prueft je Change Ticket `done` (Ticket-DB), Alter des Einfuehrungs-Commits
   > 2 h und das Fehlen eines offenen Archiv-PRs, und stoesst dann
   `openspec-orphan-archive.yml` per `workflow_dispatch` mit den Slugs an.
2. **Executor `scripts/openspec-orphan-archive.sh`**: archiviert die uebergebenen Slugs einzeln
   mit `openspec.sh archive` (nie mit `--allow-shrink`/`--create-new`/`--no-merge`) und
   schreibt Erfolge und Fehlschlaege in getrennte Dateien.
3. **Workflow `.github/workflows/openspec-orphan-archive.yml`**: fuehrt den Executor aus,
   buendelt Erfolge in einen Auto-Merge-PR samt neu erzeugter Freshness-Artefakte und eroeffnet
   je Fehlschlag ein GitHub-Issue mit Label `openspec-orphan`.

**Nicht im Scope:** das Epic T900228, dessen Delta bei der Archivierung in #5732 nie in die SSOT
gelangte (anderer Pfad, eigenes Ticket); `openspec.sh archive` erzeugt im Session-Pfad die
Freshness-Artefakte nicht neu; `git worktree unlock` im Cleanup von `git-workflow`.

_Ticket: T900338_
