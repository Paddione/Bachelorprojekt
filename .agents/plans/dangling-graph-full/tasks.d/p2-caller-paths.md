---
title: "p2-caller-paths — Aufrufer-Auflösung mit Belegpfad"
domains: [infra]
status: draft
---

# p2 — Aufrufer-Auflösung mit Belegpfad

Ziel: `scripts/dangling-callers.mjs` (~200 Zeilen, Budget 800) löst von jedem
Aufrufer aus auf statt Mengen zu differenzieren.

## Zu bauen

- `resolveCaller(call, providers)`: Ziel normalisieren (Query strippen,
  Trailing-Slash, `:id`-Form, Service-DNS-Prefix entfernen), exakter Join,
  sonst Belegpfad `{ caller, rawTarget, normalizedTarget, steps[], gap }`.
- `steps[]` hält jeden Normalisierungsschritt als Paar
  (`{ from, to, rule }`) — der Pfad ist im Report nachvollziehbar.
- Ausgabe: `{ resolved, broken[] }` als JSON; `broken[]` speist die roten
  fetten Knoten des Graphen. Keine Abhängigkeit zu v1-Artefakten.

## Prüfen

```bash
node scripts/dangling-callers.mjs --calls /tmp/http-calls.json --providers /tmp/providers.json --out /tmp/caller-paths.json
```

Erwartet Exit 0, jeder `broken[]`-Eintrag trägt `steps[]` mit mindestens einem
Eintrag und ein `gap`-Feld.
