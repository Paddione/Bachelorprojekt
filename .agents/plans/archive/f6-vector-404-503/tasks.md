---
title: F6 Vector-404-503 — Codesearch meldet einheitlich 503 nach Auth
domains: [website, knowledge]
status: staged
branch: fix/f6-vector-404-503-20261021
---

# f6-vector-404-503 — Implementation Plan

Ziel: Einheitliche Doktrin bei deaktiviertem Vektor-Store: 401 ohne Session,
503 `vector store disabled` mit Session — kein Flag-Leak, kein DB-Zugriff.

## File Structure

| Datei | Änderung (Worker-Output, unstaged bzw. untracked) |
|---|---|
| `components/website/src/pages/sdlc/api/codesearch.ts` | Guard hinter Auth verschoben, 404 → 503 mit Doktrin-Kommentar |
| `components/website/src/pages/sdlc/api/codesearch.test.ts` | Neu: 401 ohne Session, 503 mit Session bei Flag aus, 400-Pass bei Flag an |
| `components/website/src/pages/api/admin/knowledge/collections/index.test.ts` | Neu: Parität der Collections-Doktrin |

Verbrauchte Schnittstellen: `GET` (APIRoute), `getSession`/`isAdmin`,
`isVectorStoreEnabled()`. Produziert: neuer Guard-Aufbau + Tests.

## Tasks

- [x] 1. RED-Nachweis gegen die ungefixte Basis: neue Tests auf HEAD-Version von `codesearch.ts` fahren — expected: FAIL (404 statt 503, Guard vor Auth; belegt 2026-10-21: 2 failed, 1 passed).
- [x] 2. Guard hinter Auth verschieben, 503-Doktrin übernehmen.
- [x] 3. Beide Testdateien anlegen.
- [x] 4. Verifikation im Worktree (cwd = `components/website`): `npx vitest run src/pages/sdlc/api/codesearch.test.ts src/pages/api/admin/knowledge/collections/index.test.ts` grün (Exit 0).
- [ ] 5. Finale Gates: `task test:changed`, `task freshness:regenerate`, `task freshness:check`.

## Abnahme

Flag aus + keine Session → 401; Flag aus + Admin → 503; kein Pfad läuft gegen fehlende Tabellen.
