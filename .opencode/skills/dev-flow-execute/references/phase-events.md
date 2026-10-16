# Phase-Events — dev-flow-execute Telemetrie (Detail)

Alle Events schreibt `scripts/devflow-phase.sh` in die lokale, gitignorierte
`.agents/plans/<slug>/phase-events.log` des Worktrees (Slug = Branch ohne Typ-Präfix).
`devflow-ci-watch.sh` und `devflow-post-merge-finalize.sh` lesen die Datei
aus dem Worktree. Beide deshalb im selben Worktree aufrufen, in dem die Events entstanden sind.

Pflichtkette für den Merge: `plan done`, `implement entered`, `verify done`. Schritt 6 prüft sie
fail-closed mit `bash scripts/devflow-phase.sh check` (Exit 6 = unvollständig). Fehlt ein Event,
etwa weil der Plan in einem anderen Worktree gestagt wurde, nach erfüllter Bedingung nachtragen.

## Implementierung gestartet (Schritt 2, PFLICHT)

```bash
bash scripts/devflow-phase.sh implement entered --detail "Subagent gestartet · agent_id=$IMPLEMENTER_AGENT_ID"
```

## Implementierung fertig + Verifikation (Schritt 3, PFLICHT)

```bash
bash scripts/devflow-phase.sh implement done --detail "Implementierung fertig"
bash scripts/devflow-phase.sh verify entered --detail "task test:changed + freshness"
# erst nach grünen Tests:
bash scripts/devflow-phase.sh verify done --detail "Tests grün · freshness OK"
```
