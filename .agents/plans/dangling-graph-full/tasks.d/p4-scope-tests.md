---
title: "p4-scope-tests — Scope-Ausweitung, Tests, Runbook"
domains: [website]
status: draft
---

# p4 — Scope-Ausweitung (letzte Stufe), Tests, Runbook

Ziel: `scripts/dangling-scope-env.mjs` (~200 Zeilen, Budget 800),
`scripts/dangling-graph-full.test.ts` (Budget 900) und
`docs/runbooks/dangling-graph-full.md` (S4-Anker für alle vier Skripte).

## Zu bauen

- `collectEnvRefs(root)`: EnvVar-Verwendungen inventarisieren, gegen
  definierte Vars joinen — exakt zuerst, Reste per Namens-Ähnlichkeit mit
  derselben τ-Methodik wie v1 (kalibriert, nicht geschätzt).
- Danach dieselbe Inventar-plus-Match-Schleife für MCP-Tools und
  Taskfile-Tasks; Scope-Funde rendern violett geclustert.
- Tests (`scripts/dangling-graph-full.test.ts`, Vitest): HANDLES-Audit mit
  fehlender Kante, Belegpfad mit `steps[]` und `gap`, Rename-Bestätigung mit
  Commit-Referenz, Scope-Env-Treffer plus eine echte Waise ohne Kante. Erster
  Lauf — expected: FAIL.
- Runbook (`docs/runbooks/dangling-graph-full.md`): Aufruf aller vier
  Skripte, Deutung der sechs Klassen, τ-Rekalibrierung. Damit S4 erfüllt.

## Prüfen

```bash
npx vitest run scripts/dangling-graph-full.test.ts
task test:changed
task freshness:regenerate
task freshness:check
bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"
```

Erwartet: Vitest grün (Exit 0), danach die drei Gates grün.
