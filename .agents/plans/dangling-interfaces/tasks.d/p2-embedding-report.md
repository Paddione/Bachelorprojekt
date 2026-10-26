---
title: "p2-embedding-report — Near-Miss, HTML-Graph, Tests, Runbook"
domains: [website]
status: done
---

# p2 — Embedding-Near-Miss, HTML-Report, Tests

Ziel: `scripts/dangling-interfaces-report.mjs` (~180 Zeilen, Budget 800),
`scripts/dangling-interfaces.test.ts` (Budget 900) und
`docs/runbooks/dangling-interfaces.md` (S4-Anker für beide Skripte).

## Zu bauen

- `calibrateThreshold(pairs)`: exakte Paare als Positiv-, Zufallspaare als
  Negativbeispiele, τ als Schwelle mit Trennung (ausgeben, kein Raten).
- `nearMiss(orphanProviders, orphanConsumers, tau)`: Embedding-Ähnlichkeit,
  Kante nur bei Score ≥ τ, Top-10 je Seite begrenzen.
- HTML-Kraftgraph `dangling-graph.html`: Beinahe-Treffer rot gestrichelt mit
  Score, Anbieter-Waisen orange geclustert, Verbraucher-Waisen rot fett.
- Tests (`scripts/dangling-interfaces.test.ts`, Vitest): Normalisierung
  (`values.ts` → `/api/flux/values`, `[id]` → `:id`, Query-Strip), ein
  Near-Miss-Fall (`/api/flux/value` → `/api/flux/values` mit Score ≥ τ),
  eine echte Waise ohne Kante. Erster Lauf — expected: FAIL.
- Runbook (`docs/runbooks/dangling-interfaces.md`): Aufruf beider Skripte,
  Deutung der drei Klassen, τ-Rekalibrierung. Damit S4 erfüllt.

## Prüfen

```bash
npx vitest run scripts/dangling-interfaces.test.ts
task test:changed
task freshness:regenerate
task freshness:check
bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"
```

Erwartet: Vitest grün (Exit 0), danach die drei Gates grün.
