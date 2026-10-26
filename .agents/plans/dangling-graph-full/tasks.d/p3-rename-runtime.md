---
title: "p3-rename-runtime — Rename-Historie plus Laufzeit-Beleg"
domains: [website]
status: draft
---

# p3 — Rename-Historie plus Laufzeit-Beleg

Ziel: `scripts/dangling-rename-runtime.mjs` (~180 Zeilen, Budget 800)
korreliert deterministische Historie und beobachtete Laufzeit, bevor etwas
per Embedding geraten wird.

## Zu bauen

- `findRenames(pairs)`: `git log --follow --name-only` je Anbieter-Datei,
  Paare aus v1-Beinahe-Treffern bestätigen oder verwerfen, Ausgabe
  `{ confirmed[], rejected[] }` mit Commit-Referenz je Paar.
- `attachRuntime(nodes, logLines)`: 404- und Proxy-Log-Zeilen auf Knoten
  mappen (`{ node, hits, lastSeen }`), Treffer bekommen den roten Ring.
- Bestätigte Paare rendern blau gepunktet mit Commit-Referenz, verworfene
  fallen auf den Embedding-Pfad aus v1 zurück — kein eigener Embedding-Code.

## Prüfen

```bash
node scripts/dangling-rename-runtime.mjs --pairs /tmp/near-miss.json --logs /tmp/proxy-404.log --out /tmp/rename-runtime.json
```

Erwartet Exit 0 und die Zähler `confirmed / rejected / withRuntime`.
