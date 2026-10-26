---
title: "p1-inventory-exact — Anbieter-Inventar plus Exakt-Abgleich"
domains: [infra]
status: draft
---

# p1 — Inventar plus Exakt-Abgleich

Ziel: `scripts/dangling-interfaces.mjs` (~220 Zeilen, Budget 800) baut das
Anbieter-Inventar und den exakten Abgleich. Keine Embedding-Abhängigkeit.

## Zu bauen

- `collectProviders(root)`: `src/pages/api/**/*.ts` → Route
  (`values.ts` → `/api/flux/values`, `index.ts` → Verzeichnisroute,
  `[id].ts` → `:id`, `[...rest].ts` → `:rest*`). Exportiert `Provider[]`
  (`{ route, normalized, sourceFile }`).
- `normalizeCallTarget(raw)`: Query strippen, Trailing-Slash (außer `/`),
  Service-DNS-Prefix (`host:port` → Pfadanteil) entfernen, `:id`-Form.
- `exactMatch(providers, callTargets)`: Join über `normalized`; Ausgabe
  `{ matched, orphanProviders, orphanConsumers }` als JSON auf stdout und
  Datei (`dangling-exact.json` im Ausgabeverzeichnis).
- Keine Brand-Domain-Literale in Snippets (S3); reine Module ohne
  Rück-Import (S2).

## Prüfen

```bash
node scripts/dangling-interfaces.mjs --providers src/pages/api --calls /tmp/calls.json --out /tmp/dangling-exact.json
```

Erwartet Exit 0 und drei Zähler in der Ausgabe
(`matched / orphanProviders / orphanConsumers`).
