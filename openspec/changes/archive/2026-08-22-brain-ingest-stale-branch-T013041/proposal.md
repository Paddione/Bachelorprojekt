# Proposal: brain-ingest-stale-branch-T013041

## Why

`scripts/brain-ingest.sh` bevorzugt beim Branch-Preparation `origin/$BRANCH`, sobald er existiert (Zeile 203–205): `git checkout -B "$BRANCH" "origin/$BRANCH"`. Da `origin/feature/brain-initial-ingest` 362 Commits hinter Brain-main zurückliegt, wird der generierte Commit auf einen veralteten Base gesetzt — das Ergebnis ist PR #11 im Repo `Paddione/brain` mit einem Dirty-Diff von 1.252 Dateien inkl. 249 Löschungen. Der Commit wurde gepusht, aber bewusst nicht gemergt. Zusätzlich verschleiert ein fehlgeschlagener Push den Fehler (`WARN: git push failed` + `exit 0`, Zeile 611–614), und es gibt kein Staleness-Gate vor dem Delivery. [T013041]

## What

1. **Branch-Preparation umdrehen**: Ein Lauf startet immer vom aktuellen `origin/main`; der Remote-Delivery-Branch wird nicht mehr als Base verwendet.
2. **Staleness-Gate vor Delivery**: Nach der (langen) LLM-Generierung wird re-gefetcht und geprüft, ob `origin/main` während des Laufs gewandert ist; ja → sauberer Rebase des einzelnen generierten Commits oder lauter Abbruch.
3. **Push-Fehler laut machen**: Nicht-fast-forward-Push führt zu Exit ungleich 0 statt `WARN` + `exit 0`.
4. **Einmalige Remediation** (Executor-Schritt mit Bestätigung): Dirty PR #11 schließen und den stale Remote-Branch `feature/brain-initial-ingest` löschen — der Inhalt war nie gemergt.

_Ticket: T013041_
