---
title: "dangling-graph-full — Alle Graph-Auswertungsarten, Scope als letzte Stufe"
domains: [website, infra]
status: completed
---

# dangling-graph-full — Implementation Plan

Folge-Plan zu `feature/dangling-interfaces` (v1 läuft, wird nicht angerührt):
HANDLES-Audit, Aufrufer-Auflösung mit Belegpfad, Rename-plus-Laufzeit und als
letzte Stufe die Scope-Ausweitung über HTTP hinaus. Alle Targets sind neue
Dateien, disjunkt zu den v1-Targets.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/dangling-handles-audit.mjs` | 0 (neu) | 800 (.mjs-Limit 800, Reserve ≈600) |
| `scripts/dangling-callers.mjs` | 0 (neu) | 800 (.mjs-Limit 800, Reserve ≈600) |
| `scripts/dangling-rename-runtime.mjs` | 0 (neu) | 800 (.mjs-Limit 800, Reserve ≈620) |
| `scripts/dangling-scope-env.mjs` | 0 (neu) | 800 (.mjs-Limit 800, Reserve ≈600) |
| `scripts/dangling-graph-full.test.ts` | 0 (neu) | 900 (.ts-Limit 900) |
| `docs/runbooks/dangling-graph-full.md` | neu | n/a (Markdown, S4-Anker) |

Verbrauchte Schnittstellen: Astro-Dateirouten, HTTP_CALLS-Ziele aus dem
Codegraph-Export, `git log --follow`, 404-/Proxy-Logs, EnvVar-Knoten.
Produziert: Audit-JSON, Belegpfad-JSON, Korrelations-JSON, erweiterter
HTML-Graph (blau gepunktet, roter Ring, violetter Cluster). S4: alle vier
Skripte sind vom Runbook aus erreichbar. CQ02: keine neuen `any`-Typen.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-handles-audit.md | impl | `scripts/dangling-handles-audit.mjs` |  |
| p2 | tasks.d/p2-caller-paths.md | impl | `scripts/dangling-callers.mjs` | p1 |
| p3 | tasks.d/p3-rename-runtime.md | impl | `scripts/dangling-rename-runtime.mjs` | p2 |
| p4 | tasks.d/p4-scope-tests.md | tests | `scripts/dangling-scope-env.mjs`, `scripts/dangling-graph-full.test.ts`, `docs/runbooks/dangling-graph-full.md` | p3 |

## Tasks

- [x] **0. Rotphase zuerst:** `npx vitest run scripts/dangling-graph-full.test.ts` auf ungeänderter Basis — expected: FAIL (Audit, Belegpfad, Rename-Korrelation und Scope-Matching fehlen; Beleg: 3 failed, rest passed).
- [x] **1. Partial p1** (`tasks.d/p1-handles-audit.md`): HANDLES-Lücken-Audit bauen.
- [x] **2. Partial p2** (`tasks.d/p2-caller-paths.md`): Aufrufer-Auflösung mit Belegpfad bauen.
- [x] **3. Partial p3** (`tasks.d/p3-rename-runtime.md`): Rename-plus-Laufzeit-Korrelation bauen.
- [x] **4. Partial p4** (`tasks.d/p4-scope-tests.md`): Scope-Ausweitung plus Tests grün plus Runbook-Anker.
- [ ] **5. Finaler Verifikations-Task.** `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
