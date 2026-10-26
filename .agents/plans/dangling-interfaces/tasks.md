---
title: "dangling-interfaces — Dangling HTTP-Schnittstellen mit Embedding-Kanten sichtbar machen"
domains: [website, infra]
status: staged
---

# dangling-interfaces — Implementation Plan

Ziel: Anbieter-Inventar aus Astro-Dateirouten exakt mit HTTP_CALLS abgleichen,
Reste per Embedding-Ähnlichkeit (kalibriertes τ) als Beinahe-Treffer oder Waisen
klassifizieren und als HTML-Kraftgraph ausgeben. Klassen: Beinahe-Treffer rot
gestrichelt mit Score, Anbieter-Waisen orange geclustert, Verbraucher-Waisen
rot fett.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/dangling-interfaces.mjs` | 0 (neu) | 800 (.mjs-Limit 800, Reserve ≈580) |
| `scripts/dangling-interfaces-report.mjs` | 0 (neu) | 800 (.mjs-Limit 800, Reserve ≈620) |
| `scripts/dangling-interfaces.test.ts` | 0 (neu) | 900 (.ts-Limit 900) |
| `docs/runbooks/dangling-interfaces.md` | neu | n/a (Markdown, S4-Anker) |

Verbrauchte Schnittstellen: Astro-Dateirouten unter `src/pages/api/**/*.ts`,
K8s-Service-DNS, HTTP_CALLS-Ziele aus dem Codegraph-Export. Produziert:
`dangling-interfaces.json` plus `dangling-graph.html` (rot gestrichelt / orange
/ rot fett). S4: beide Skripte sind vom Runbook aus erreichbar. CQ02: keine
neuen `any`-Typen (aktuelle Zählung im Verify-Task prüfen).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-inventory-exact.md | impl | `scripts/dangling-interfaces.mjs` |  |
| p2 | tasks.d/p2-embedding-report.md | tests | `scripts/dangling-interfaces-report.mjs`, `scripts/dangling-interfaces.test.ts`, `docs/runbooks/dangling-interfaces.md` | p1 |

## Tasks

- [ ] **0. Rotphase zuerst:** `npx vitest run scripts/dangling-interfaces.test.ts` auf ungeänderter Basis — expected: FAIL (Normalisierung und τ-Kalibrierung fehlen; Beleg: 2 failed, rest passed).
- [ ] **1. Partial p1** (`tasks.d/p1-inventory-exact.md`): Inventar plus Exakt-Abgleich bauen.
- [ ] **2. Partial p2** (`tasks.d/p2-embedding-report.md`): Embedding-Near-Miss, HTML-Report, Tests grün, Runbook-Anker.
- [ ] **3. Finaler Verifikations-Task.** `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
