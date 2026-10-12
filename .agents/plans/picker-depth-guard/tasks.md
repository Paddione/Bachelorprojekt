---
title: Picker depth guard + traversal 400 mapping
ticket_id: T901942
domains: [videovault]
status: staged
---
# picker-depth-guard — Implementation Plan

Revision: `6678b2323` (origin/main) · Worktree: `fix/picker-depth-guard-T901942`
· Spec: `.agents/plans/picker-depth-guard/design.md` · Ticket: T901942.

Ziel: Zwei triagierte Defekte aus der 4b-Analyse beheben — unbegrenzte
Picker-Rekursion (RangeError) und Traversal-500-statt-400. Akzeptanz: Die drei
RED-Tests aus Task 1 sind nach Task 2+3 grün, alle übrigen Suiten bleiben grün.

## File Structure

- `components/VideoVault/client/src/components/directory-tree.ts` — NEU
  (~70 Zeilen, Limit 900): `TreeNode`, `MAX_TREE_DEPTH`, `buildTree`,
  `sortTree`, `maxTreeDepth`. Reines Modul ohne Imports (S2).
- `components/VideoVault/client/src/components/directory-picker-modal.tsx`
  — Ist 190, Budget 410: lokale Baum-Definition entfernen, Modul importieren.
- `components/VideoVault/server/routes/processing-helpers.ts`
  — Ist 17, Budget 883: `TraversalError`, `toRouteError` ergänzen.
- `components/VideoVault/server/routes/processing-movie-handlers.ts`
  — Ist 521, Budget 379: 5 Catches auf `toRouteError` umstellen.
- `components/VideoVault/client/src/components/directory-tree.test.ts`
  — Ist 41, Budget 859: RED-Suite Client (in diesem Stage-Commit enthalten).
- `components/VideoVault/server/routes/processing-movie-handlers.test.ts`
  — Ist 28, Budget 872: RED-Suite Server (in diesem Stage-Commit enthalten).
- `tests/py/spec/videovault/test_picker_depth_guard.py`
  — Ist 33, Budget 767: pytest-Wrapper (in diesem Stage-Commit enthalten).

## Tasks

### Task 1 — RED bestätigen (expected: FAIL)

Permitted files: keine (nur lesen/ausführen). Runtime: node + npx + pytest.

1. `cd components/VideoVault && npx vitest run --config vitest.config.ts client/src/components/directory-tree.test.ts` → expected: FAIL (Import `./directory-tree` fehlt).
2. `npx vitest run -c vitest.server.config.ts server/routes/processing-movie-handlers.test.ts` → expected: FAIL (Status 500 statt 400). Produktives Netz: Das globale Setup braucht Docker-Postgres auf 5433; ist der Port belegt (pg-korczewski Staging-DB, geschützt), denselben Befehl mit einer temporären No-DB-Config fahren (Datei danach löschen, nie committen).
3. `bash scripts/pytest-run.sh tests/py/spec/videovault/test_picker_depth_guard.py` → expected: FAIL (Client-Suite rot). Fehlen die vv-node_modules, skipt der Wrapper per Guard (erwartetes Verhalten, kein Grün).

### Task 2 — Client: Baum-Modul extrahieren + Cap

Permitted files:
`components/VideoVault/client/src/components/directory-tree.ts` (neu),
`components/VideoVault/client/src/components/directory-picker-modal.tsx`.

1. `directory-tree.ts` anlegen (verbatimer Move aus dem Modal + Cap):
   - `export interface TreeNode { name: string; path: string; children: TreeNode[] }`
   - `export const MAX_TREE_DEPTH = 256`
   - `export function buildTree(directories: string[], normalizeDir: (d: string) => string): TreeNode` — identische Logik wie bisher, aber Segment-Schleife bricht bei Tiefe 256 ab (Rest des Pfads verworfen, kein Fehler).
   - `export function sortTree(node: TreeNode): void` — unverändert (rekursiv, durch Cap begrenzt).
   - `export function maxTreeDepth(node: TreeNode): number` — iterative Tiefenmessung für Tests.
2. Modal umstellen: `TreeNode`/`buildTree`/`sortTree`-Definitionen löschen,
   `import { buildTree, sortTree, type TreeNode } from './directory-tree'`
   ergänzen; im `tree`-Memo `buildTree(directories)` →
   `buildTree(directories, DirectoryDatabase.normalizeDir)`, `sortTree(root)`
   unverändert lassen (Aufrufstellen bleiben 1:1, nur die Herkunft ändert sich).
3. Prüfen: `cd components/VideoVault && npx vitest run --config vitest.config.ts client/src/components/directory-tree.test.ts` → 3/3 grün.
4. Prüfen: `npx tsc --noEmit` im Client-Kontext des Pakets (Befehl aus dessen
   `check`-Skript) → fehlerfrei; normale Bäume rendern unverändert (Shallow-
   Anchor im RED-Test deckt das ab).

### Task 3 — Server: Traversal → 400 mappen

Permitted files:
`components/VideoVault/server/routes/processing-helpers.ts`,
`components/VideoVault/server/routes/processing-movie-handlers.ts`,
`components/VideoVault/server/routes/processing-movie-handlers.test.ts`
(erweitern erlaubt).

1. In `processing-helpers.ts` ergänzen:
   - `export class TraversalError extends Error {}`
   - `export function toRouteError(error: any): { status: number; message: string }` — `error instanceof TraversalError` → `{ status: 400, message: error.message }`, sonst `{ status: 500, message: error?.message ?? 'Internal error' }`.
   - `resolveAndValidateMovieDir` wirft `new TraversalError('Path traversal detected')` (Nachricht identisch).
2. In `processing-movie-handlers.ts` alle 5 Catches der Handler mit
   Traversal-Stellen (`handleMoviesRename`, `handleMoviesDelete`,
   `handleMoviesOrganizeInbox`, `handleMoviesIndex`, `handleMoviesCleanup`)
   umstellen von `res.status(500).json({ error: error.message })` auf
   `const e = toRouteError(error); res.status(e.status).json({ error: e.message })`.
3. Prüfen: Server-Suite wie in Task 1 Schritt 2 → beide Tests grün.
   Ergänze je einen 400-Fall für die vier weiteren Handler (Muster:
   `movieDir`-äquivalentes Feld mit `../..`-Pfad, erwarte 400).

### Task 4 — Verify (Integration)

1. `task test:changed`
2. `task freshness:regenerate`
3. `task freshness:check`
4. Falls `components/website/src/data/test-inventory.json` durch die neuen
   Tests dirty wird: `task test:inventory` und Datei mitcommitten (erwartet:
   keine Änderung, Inventar ist website-bezogen).
5. Erwartet: alles grün; bekannte lokale Env-Abweichungen (mcp-Drift,
   belegter Port 5433, defekte tsx-Toolchain) sind dokumentiert und
   blockieren nicht.
