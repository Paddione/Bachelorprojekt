---
title: "p1-handles-audit — HANDLES-Lücken-Audit"
domains: [infra]
status: draft
---

# p1 — HANDLES-Lücken-Audit

Ziel: `scripts/dangling-handles-audit.mjs` (~200 Zeilen, Budget 800) misst die
Indexer-Lücke statt sie zu umgehen: jede Astro-Dateiroute gegen die
Route-Knoten halten.

## Zu bauen

- `collectFileRoutes(root)`: `src/pages/api/**/*.ts` → Route
  (`values.ts` → `/api/flux/values`, `index.ts` → Verzeichnisroute,
  `[id].ts` → `:id`, `[...rest].ts` → `:rest*`).
- `auditHandles(fileRoutes, routeNodes)`: Join über die normalisierte Route,
  Ausgabe `{ linked, unlinked[] }` als JSON auf stdout und Datei.
- Jeder `unlinked[]`-Eintrag trägt `sourceFile` plus vermutete Route — das ist
  der Entscheidungsbeleg für oder gegen einen Indexer-Umbau. Kein Umbau hier.
- Reines Modul ohne Rück-Import (S2), keine Brand-Domain-Literale (S3).

## Prüfen

```bash
node scripts/dangling-handles-audit.mjs --providers src/pages/api --routes /tmp/route-nodes.json --out /tmp/handles-audit.json
```

Erwartet Exit 0 und drei Zähler (`linked / unlinked / total`), dazu hat jeder
`unlinked`-Eintrag ein `sourceFile`-Feld.
