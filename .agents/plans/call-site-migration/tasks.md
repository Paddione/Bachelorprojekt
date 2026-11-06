---
title: "call-site-migration — llm/coaching/code-quality → website über website/ports (Goal od1-website-sink)"
domains: [website]
status: staged
goal: od1-website-sink
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# call-site-migration — Implementation Plan

Zweck: Follow-up zur W2-A-Auth-Extraktion (merged in `2e57b2d93`):
Alle direkten `llm|coaching|code-quality → website`-Call-Sites auf die neue
`website/ports`-Fassade umstellen (SessionResolver/AdminPolicy-Seams aus
`components/website/src/lib/auth.ts:260-420` wiederverwenden), per-request
Session-Resolution beibehalten, Boundary-Test als CI-Gate einführen.
Verhalten der Migration: reine Call-Site-Umleitung, keine Verhaltensänderung.

Endzustand: kein direkter Cross-Import `llm|coaching|code-quality → website`
mehr (Boundary 74 → 0 für Direkt-Importe), alles läuft über `website/ports`;
`get_architecture(boundaries)`-Beleg + Boundary-Test grün im CI-Gate.

## Bestand (T1-Inventar, 2026-11-06, lesend erhoben)

Graph (`get_architecture`, aspects=[boundaries]; Index stale:
`b678a5f` vs HEAD `2e57b2d93` → P0 re-baselined vor Wellenstart):

| Boundary (from → to) | CALLS | Bemerkung |
|---|---|---|
| `llm → website` | **74** | bestätigt, entspricht Task-Paket |
| `llm-proxy → website` | 31 | llm-Familie, eigene Welle |
| `index-repo → website` | 9 | Nebenläufer, W4 |
| `knowledge → website` | 8 | Nebenläufer, W4 |
| `code-quality → website` | ≤5 (Top-10-Schwelle) | Goal nannte 21 (älterer Receipt); P0 klärt Delta |
| `coaching → website` | ≤5 (Top-10-Schwelle) | Goal nannte 15 (älterer Receipt); P0 klärt Delta |

Statische Produktions-Importe (nicht Test, kein Kommentar), per `rg`:

| Caller | Importe aus `components/website/src/…` | Welle |
|---|---|---|
| `scripts/coaching/ingest-book.mts` | `lib/chunking.ts`, `lib/embeddings.ts` | P2 |
| `scripts/coaching/batch-ingest-dir.mts` | dyn. `lib/chunking.ts`, `lib/embeddings.ts` | P2 |
| `scripts/coaching/classify-book.mts` | `lib/coaching-classifier.ts`, `lib/coaching-db.ts` | P2 |
| `scripts/coaching/ingest-json.mts` | `lib/ingest-json-core.js` | P2 |
| `scripts/coaching/merge-books.mts` | `lib/coaching-merge.ts` | P2 |
| `scripts/build-route-manifest.mjs` | `src/config/brands/{mentolder,korczewski}.ts` | P4 (Achtung: brand-trennung entfernt mentolder — Abhängigkeit prüfen) |
| `scripts/llm-proxy/*`, `scripts/code-quality/*`, `scripts/sdlc/*` | keine direkten Prod-Imports (nur Pfad-Strings + Test-Util-Rauschen) | P3/P4 verifizieren |

Rauschen (ausdrücklich NICHT migrieren, im Boundary-Test exkludieren):
`graph-utils.test.node`, `cockpit-api.test.url`, `zugferd.test.test`
(geteilte Test-Helper, von Skript-Tests importiert) sowie
VideoVault→`auth.DbSessionResolver.resolve`-Kanten (Name-Kollision mit
`Promise.resolve`, keine echten Imports). Externe `auth.ts`-Caller: keine
(alle 419 `lib/auth`-Referenzen liegen innerhalb `components/website`).

STOP-Regel: Weicht der P0-Re-Baseline-Count wild von 74 ab (> ±25 %),
Wellen neu gruppieren und an Primary zurückgeben — nicht still rescopen.

## File Structure

| Datei | Ist-Zeilen | Status |
|---|---|---|
| `components/website/src/lib/ports/index.ts` | 0 (neu) | neu (`.ts`, S1-Limit 900 — klein halten, nur Re-Exports + Typen) |
| `components/website/src/lib/ports/session.ts` | 0 (neu) | neu (SessionResolver-Fassade, kein DB-Code) |
| `components/website/src/lib/ports/policy.ts` | 0 (neu) | neu (AdminPolicy-Fassade) |
| `components/website/src/lib/ports/content.ts` | 0 (neu) | neu (chunking/embeddings/coaching-Re-Exports) |
| `tests/py/spec/website_sink/test_boundary_no_new_imports.py` | 0 (neu) | neu (Boundary-Test, CI-Gate) |
| `scripts/coaching/*.mts` (5 Dateien) | je < 200 | ändern (Importpfade → ports) |
| `scripts/build-route-manifest.mjs` | ~60 | ändern (nur falls mentolder-frei möglich, sonst P4-Skipp mit Begründung) |
| `.agents/goals/od1-website-sink/GOAL.md` | — | LESEN, nicht editieren (Primary trägt `plan_refs:` ein, Zeile siehe Übergabe) |

<!-- vitest: kein neuer Test nötig, weil die Fassade nur Re-Exports enthält und
alle Verhaltens-Regressionen über bestehende Website-Suites (`auth.test.ts` u.a.)
via `task test:changed` abgedeckt sind; neuer Gate-Test ist pytest (Boundary). --> (Primary trägt `plan_refs:` ein, Zeile siehe Übergabe) |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p0 | tasks.d/p0-baseline-gate.md | tests | `tests/py/spec/website_sink/test_boundary_no_new_imports.py` | |
| p1 | tasks.d/p1-ports-facade.md | impl | `components/website/src/lib/ports/index.ts`, `ports/session.ts`, `ports/policy.ts` | p0 |
| p2 | tasks.d/p2-coaching.md | impl | `scripts/coaching/ingest-book.mts`, `batch-ingest-dir.mts`, `classify-book.mts`, `ingest-json.mts`, `merge-books.mts`, `components/website/src/lib/ports/content.ts` | p1 |
| p3 | tasks.d/p3-llm.md | impl | `scripts/llm-proxy/*` (Re-Baseline-Ergebnis, max. 10 Sites) | p2 |
| p4 | tasks.d/p4-codequality-rest.md | impl | `scripts/code-quality/*`, `scripts/sdlc/*`, `scripts/build-route-manifest.mjs`, `scripts/index-repo.ts` | p3 |
| p5 | tasks.d/p5-verify.md | tests | `tests/py/spec/website_sink/test_boundary_no_new_imports.py` (Verschärfung), Beleg-Artefakte | p4 |

## Tasks

- [ ] **0. Partial p0** (`tasks.d/p0-baseline-gate.md`): Re-Baseline + Boundary-Test ( jego Welle hängt davon ab).
- [ ] **1. Partial p1** (`tasks.d/p1-ports-facade.md`): `website/ports`-Fassade (auth-adjacent zuerst).
- [ ] **2. Partial p2** (`tasks.d/p2-coaching.md`): Coaching-Welle (7 Sites, 5 Dateien).
- [ ] **3. Partial p3** (`tasks.d/p3-llm.md`): LLM-Welle (Re-Baseline-Split, ≤10 Sites pro Schritt).
- [ ] **4. Partial p4** (`tasks.d/p4-codequality-rest.md`): Code-Quality + Rest-Welle.
- [ ] **0a. Rotphase (p0):** Boundary-Test mit LEERER Allowlist laufen lassen → MUSS FAILen
  (beweist, dass das Gate den Bestand erkennt); erst dann Allowlist setzen → grün.
- [ ] **5. Partial p5** (`tasks.d/p5-verify.md`): Finaler Verifikations-Task —
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`,
  `task workspace:validate` (Boundary 74→0, Gates grün).
