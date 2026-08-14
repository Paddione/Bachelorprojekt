# Proposal: batch-local-test-runner-fixes

## Why

Lokale Test-Läufe (`task test:changed`, Vitest und Code-Quality Gates) müssen für Entwickler und Agents zuverlässig, deterministisch und ohne irreführende Fehlalarme oder stundenlange Hänger durchlaufen. Aktuell führen drei separate Probleme zu Fehlern im Entwickler-Workflow:
1. **T003963 (Cockpit Vitest):** `website/src/lib/sdlc/tickets/__tests__/cockpit-api*.test.ts` mocken `../../../lib/auth` und `../../../lib/tickets/cockpit-db`, was wegen 4 Verzeichnisebenen Tiefe (`src/lib/sdlc/tickets/__tests__/`) zu falschen relativen Pfaden führt (`src/lib/lib/auth` existiert nicht). Dadurch greift der Mock nicht und 32 Tests schlagen mit 403 statt 200/400 fehl.
2. **T003990 (task test:changed Timeout):** Wenn `website/`-Pfade geändert werden, triggert `RUN_E2E_WEBSITE=true` Playwright-Tests gegen `localhost:4321`. Läuft der Dev-Server lokal nicht, hängt der Testlauf bis zum Timeout anstatt — analog zu `RUN_E2E_SERVICES` — sichtbar mit Port-Reachability-Check zu skippen.
3. **T004263 (madge in Worktrees):** In `scripts/code-quality/gates/s2-cycles.mjs` wird madge über `node_modules/.bin/madge` gesucht. Wenn `madge` im globalen Root-node_modules liegt oder PATH verwendet wird, bricht ein unvollständiges Symlink-Setup mit ENOENT ab. Eine robuste Auflösung via `which madge` / Node-Resolve oder Fallback verhindert dies.

## What

1. **P1 (T003963):** Relative Mock-Pfade in `website/src/lib/sdlc/tickets/__tests__/cockpit-api.test.ts` und `cockpit-api-actions.test.ts` auf `../../../../lib/auth` und `../../../../lib/sdlc/tickets/cockpit-db` korrigieren.
2. **P2 (T003990):** In `Taskfile.yml` für `RUN_E2E_WEBSITE` denselben `(exec 3<>/dev/tcp/127.0.0.1/4321)` Port-Reachability-Skip wie bei `RUN_E2E_SERVICES` einbauen, mit klarer Ausgabe, wenn der Skip greift.
3. **P3 (T004263):** In `scripts/code-quality/gates/s2-cycles.mjs` die madge-Pfadauflösung absichern (Existenzprüfung in Root- und Worktree-Pfade, Fallback auf `npx madge` oder PATH), sodass `test:code-quality` auch in beliebigen Worktree-Umgebungen nicht an ENOENT scheitert.

_Ticket: T004296 (inkl. Sub-Tickets T003963, T003990, T004263)_

