# T002877: openspec-embed Completeness-Gate

## Ziel
Das Completeness-Gate von openspec-embed erkennt die Diskrepanz zwischen 12 Dokumenten in der Collection und 57 lokalen Spec-Dateien und meldet sie als Fehler, nicht als Erfolg.

## Tasks

### 1. Gate-Logik prüfen
- [x] `scripts/openspec-embed.mjs` — Completeness-Check analysieren
- [x] Warum werden 57 Dateien als "complete" gemeldet, wenn nur 12 in der Collection sind?

### 2. Fix
- [x] Korrekte Zählung der lokalen Dateien vs. Collection-Einträge
- [x] Fehler bei Diskrepanz > Toleranz (z.B. 10%)

### Verify
- [x] `task freshness:check` schlägt fehl bei 12/57-Diskrepanz
- [x] Embed-Command läuft ohne Fehler durch
