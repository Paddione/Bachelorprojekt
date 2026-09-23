---
title: "mishap-buffer-path-unification — Design"
ticket_id: T900309
status: active
---

# mishap-buffer-path-unification — Design

_Ticket: T900309_

## Kontext

Die Komponenten `server.mjs` (Node-Server), `runner.mjs` (CLI/Runner) und `mishap.go` (Go-Tool) verwalten den Mishap-Puffer.
Laut Spezifikation `openspec/specs/mcp-skill-integration.md` muss der Puffer unter `<git-common-dir>/mishap-buffer.json` liegen, damit er über Worktrees und Session-Grenzen hinweg geteilt wird.
Aktuell referenzieren die drei Dateien jedoch unterschiedliche Pfade:
1. `server.mjs:40`: `join(gitDir, '..', 'mishap-buffer.json')` -> Repo-Root
2. `runner.mjs:124`: `join(repoRoot, '.git', 'info', 'mishap-buffer.json')` -> `.git/info/`
3. `mishap.go:53`: `filepath.Join(gitCommonDir(runner.RepoRoot()), "mishap-buffer.json")` -> `<git-common-dir>/mishap-buffer.json`

## Entscheidungen

**D1 — `server.mjs` korrigieren.**
In `scripts/ticket-mcp-node/server.mjs` liefert `gitCommonDir(root)` bereits das gemeinsame Git-Verzeichnis (z. B. `.git`). Der Aufruf `join(gitDir, '..', 'mishap-buffer.json')` wird korrigiert zu `join(gitDir, 'mishap-buffer.json')`.

**D2 — `runner.mjs` auf `gitCommonDir` umstellen.**
In `scripts/ticket-mcp-node/runner.mjs` wird dieselbe `gitCommonDir`-Hilfsfunktion wie in `server.mjs` bereitgestellt (per `git rev-parse --git-common-dir`), und `mishapBufferPath(repoRoot)` nutzt `join(gitCommonDir(repoRoot), 'mishap-buffer.json')`.

**D3 — Testabsicherung in `mcp-skill-integration.bats`.**
In `tests/spec/mcp-skill-integration.bats` wird ein Test ergänzt, der sicherstellt, dass:
- `scripts/ticket-mcp-node/server.mjs` nicht mehr `..` nach `gitDir` referenziert.
- `scripts/ticket-mcp-node/runner.mjs` nicht mehr `.git/info` referenziert, sondern `gitCommonDir`.
- Alle Implementierungen auf dieselbe Datei zielen.

## Risiken

Keine; behebt einen erkannten Bug und stellt Konsistenz zwischen Node und Go her.
