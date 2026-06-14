---
ticket_id: T000725
plan_ref: docs/superpowers/plans/2026-06-14-mishap-auto-kategorisierung.md
status: active
date: 2026-06-14
---

# Spec: Mishap-Tracker Auto-Kategorisierung (T000725)

## Kontext: Ist-Zustand

Mishap-Tickets werden von `mishap-tracker` SKILL und dem `scripts/ticket.sh create --type mishap` Flow in `tickets.tickets` abgelegt. Die Tabelle hat **kein `category`-Feld** — alle Mishaps landen ungefiltert als homogene Masse in der Triage-Queue ohne erkennbare Muster. Wiederkehrende Fehlerklassen (z.B. CI-Konflikte, Gate-Fehler, Deploy-Crashes) sind nicht auf einen Blick erkennbar, und eine gezielte Analyse ("welche Kategorie tritt am häufigsten auf?") ist nicht möglich.

## Was dieses Feature ändert

Nach dieser Änderung erhält jedes neu erstellte Mishap-Ticket automatisch eine **`category`**-Spalte in der DB, die per Keyword-Matching befüllt wird. Bei eindeutigen Matches erfolgt die Kategorisierung lokal (schnell, offline-fähig). Bei unklarem Match wird DeepSeek als Fallback befragt. Falls weder Keyword-Match noch LLM-Antwort verfügbar ist, fällt das System auf `"Sonstige"` zurück.

Die gesamte Logik liegt in einem neuen `scripts/mishap-categorize.sh` — `ticket.sh` bekommt nur einen minimalen Aufruf-Wrapper (~5 Zeilen) ohne Netto-Zeilen-Zuwachs.

## Kern-Nutzerflow

```
ticket.sh create --type mishap --title "..." --description "..."
  │
  ├─ INSERT in tickets.tickets (wie bisher) → gibt external_id zurück
  │
  └─ mishap-categorize.sh <external_id> <title> <description>
       │
       ├─ Schritt 1: Keyword-Matching gegen mishap-keywords.json
       │    ├─ Eindeutiger Match (≥1 Keyword aus genau 1 Kategorie) → Kategorie speichern
       │    ├─ Mehrdeutiger Match (Keywords aus >1 Kategorie) → höchste Trefferanzahl gewinnt
       │    └─ Kein Match → weiter zu Schritt 2
       │
       ├─ Schritt 2: DeepSeek-Fallback (falls DEEPSEEK_API_KEY gesetzt)
       │    └─ Kurzer Prompt: Kategorie aus fester Liste wählen → Antwort parsen
       │
       └─ Schritt 3: Fallback → "Sonstige"
            └─ UPDATE tickets.tickets SET category='Sonstige' WHERE external_id=...
```

## Die 7 Kategorien (+ "Sonstige")

| Kategorie | Keyword-Beispiele (case-insensitive) |
|-----------|--------------------------------------|
| **CI-Konflikt** | `merge conflict`, `CONFLICTING`, `rebase`, `conflict marker`, `<<<<<<`, `resolve conflict` |
| **Gate-Fehler** | `S1-Gate`, `S2-Gate`, `S3-Gate`, `S4-Gate`, `baseline`, `ratchet`, `line limit`, `violation`, `freshness:check` |
| **API-Fehler** | `402`, `429`, `timeout`, `rate limit`, `connection refused`, `ECONNREFUSED`, `503`, `upstream`, `unreachable` |
| **Scout-Qualität** | `touched_files`, `scout`, `0 files`, `no files changed`, `low quality`, `0 touched`, `empty plan` |
| **Deploy-Fehler** | `rollout`, `CrashLoopBackOff`, `ImagePullBackOff`, `deploy`, `kubectl`, `ErrImagePull`, `pending`, `OOMKilled` |
| **Spec-Lücke** | `spec`, `missing requirement`, `undefined behavior`, `undocumented`, `no spec`, `unspecified`, `assumption` |
| **Test-Lücke** | `test`, `BATS`, `assertion`, `test:all`, `coverage`, `playwright`, `failing test`, `no test` |

Die Keyword-Liste ist konfigurierbar via `scripts/mishap-keywords.json` — keine Code-Änderung nötig, um Keywords hinzuzufügen/anzupassen.

## Akzeptanzkriterien

1. `ticket.sh create --type mishap ...` gibt weiterhin `external_id` zurück (unverändert).
2. Jedes neue Mishap-Ticket hat danach eine befüllte `category`-Spalte in der DB.
3. Keyword-Matching funktioniert offline (kein Netzwerk nötig).
4. Falls DEEPSEEK_API_KEY nicht gesetzt ist oder der LLM-Aufruf fehlschlägt, wird `"Sonstige"` gesetzt (fail-safe, nie leer lassen).
5. `mishap:categorize` Task ist per `task mishap:categorize -- <external_id> <title> <desc>` aufrufbar (S4-Gate-Anforderung).
6. Bestehende Mishap-Tickets (ohne `category`) bleiben unberührt — Migration ist additive.
7. `task test:all` bleibt grün.

## Edge Cases

| Szenario | Verhalten |
|----------|-----------|
| Kein LLM verfügbar (kein API-Key / Netz down) | Fallback auf `"Sonstige"` — kein Fehler |
| Keywords aus mehreren Kategorien matchen | Kategorie mit den meisten Matches gewinnt; bei Gleichstand: erste in der Listing-Reihenfolge |
| Mishap hat leeren Titel und leere Beschreibung | Direkt `"Sonstige"` ohne Matching-Versuch |
| DB nicht erreichbar beim Kategorisieren | Fehler wird geloggt (`stderr`), `ticket.sh` schlägt nicht fehl (kategorisierung ist best-effort) |
| DeepSeek gibt unbekannte Kategorie zurück | Wird ignoriert, Fallback auf `"Sonstige"` |
| `mishap-categorize.sh` wird auf Nicht-Mishap-Ticket aufgerufen | Schreibt Warnung auf stderr, exit 0 (idempotent) |

## Technische Constraints

- **`category`-Spalte in DB**: `TEXT` mit `CHECK (category IN ('CI-Konflikt','Gate-Fehler','API-Fehler','Scout-Qualität','Deploy-Fehler','Spec-Lücke','Test-Lücke','Sonstige'))`. Nullable — bestehende Tickets bleiben NULL (keine Backfill).
- **Keyword-Liste**: `scripts/mishap-keywords.json` — maschinenlesbar, von `mishap-categorize.sh` per `jq` ausgelesen.
- **DeepSeek-Fallback**: Nutzt `DEEPSEEK_API_KEY` Env-Var + `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com/v1`). Kurzer Prompt mit fester Kategorie-Liste, JSON-Antwort geparsed via `jq`.
- **`ticket.sh` Budgetgrenze**: Exakt 793 Zeilen (Baseline). Die Integrierung in `cmd_create()` muss im Netto-Nullbereich bleiben — ggf. Kommentare oder Leerzeilen kürzen.
- **`mishap-categorize.sh`**: Max. 200 Zeilen. Kein externe Abhängigkeit außer `jq`, `curl`, `kubectl` (bereits vorhanden).

## Betroffene Dateien

| Datei | Änderungsart | Budget |
|-------|-------------|--------|
| `scripts/ticket.sh` | Modify — ~5-Zeilen Wrapper in `cmd_create()` nach INSERT | Netto 0 (793 Zeilen Baseline) |
| `scripts/mishap-categorize.sh` | Neu — Haupt-Logik, Keyword-Matching, DeepSeek-Fallback, DB-Update | Neu, max 200 Zeilen |
| `scripts/mishap-keywords.json` | Neu — Keyword-Konfiguration für alle 7 Kategorien | Neu |
| DB: `tickets.tickets` | Additive Migration: `ALTER TABLE tickets.tickets ADD COLUMN category TEXT CHECK (...)` | 1 SQL-Statement |
| `Taskfile.yml` | Neuer Task `mishap:categorize` (S4-Gate) | +~5 Zeilen |
