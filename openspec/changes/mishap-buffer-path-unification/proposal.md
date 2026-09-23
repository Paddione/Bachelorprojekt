# Proposal: mishap-buffer-path-unification

## Zweck

Vereinheitlichung des `mishap-buffer.json`-Pfades über alle Implementierungen (`ticket-mcp-node/server.mjs`, `ticket-mcp-node/runner.mjs` und `ticket-mcp/go/internal/tools/mishap.go`) auf `<git-common-dir>/mishap-buffer.json` (`.git/mishap-buffer.json`), wie in der SSOT-Spec `mcp-skill-integration.md` gefordert.

## Symptom (Fakt)

Drei verschiedene Implementierungen verwenden zurzeit drei unterschiedliche Pfade für den Mishap-Buffer:
1. `scripts/ticket-mcp-node/server.mjs:40` nutzt `join(gitDir, '..', 'mishap-buffer.json')` und erzeugt/sucht den Buffer im Repo-Root (`/home/patrick/Bachelorprojekt/mishap-buffer.json`).
2. `scripts/ticket-mcp-node/runner.mjs:124` nutzt `join(repoRoot, '.git', 'info', 'mishap-buffer.json')`.
3. `scripts/ticket-mcp/go/internal/tools/mishap.go:53` nutzt `filepath.Join(gitCommonDir(runner.RepoRoot()), "mishap-buffer.json")`.

Dadurch sind Mishap-Buffer-Einträge, die von einer Komponente geschrieben wurden, für andere unsichtbar, und in Worktrees schlägt der Zugriff in `runner.mjs` fehl (da `.git` im Worktree eine Datei ist).

## Ursache & Evidenz (Hypothese validiert)

- In `scripts/ticket-mcp-node/server.mjs:40`: `gitCommonDir(root)` liefert bereits den Pfad des gemeinsamen Git-Verzeichnisses (z. B. `.git`). Der Aufruf `join(gitDir, '..', 'mishap-buffer.json')` springt eine Ebene zu weit nach oben ins Arbeitsverzeichnis.
- In `scripts/ticket-mcp-node/runner.mjs:124`: `join(repoRoot, '.git', 'info', 'mishap-buffer.json')` verwendet einen abweichenden Unterordner `info` und löst das gemeinsame Git-Verzeichnis (`git-common-dir`) nicht auf.
- Die SSOT-Spezifikation in `openspec/specs/mcp-skill-integration.md` (Zeilen 58, 158) definiert eindeutig `.git/mishap-buffer.json` als gemeinsamen Speicherort.

## Lösung

1. In `scripts/ticket-mcp-node/server.mjs`: `mishapBufferPath` korrigieren zu `join(gitDir, 'mishap-buffer.json')`.
2. In `scripts/ticket-mcp-node/runner.mjs`: `gitCommonDir` implementieren und `mishapBufferPath` korrigieren zu `join(gitDir, 'mishap-buffer.json')`.
3. Test in `tests/spec/mcp-skill-integration.bats` erweitern, um sicherzustellen, dass sowohl Node als auch Go auf denselben Pfad verweisen und keine Implementierung auf `info/mishap-buffer.json` oder den Repo-Root ausweicht.

_Ticket: T900309_
