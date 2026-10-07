# Runbook: Codebase-Memory-MCP Index Stampede Mitigation & Prävention

## Soll-Zustand

Der Wissensgraph von `codebase-memory-mcp` (K3) wird auf der Entwicklerbox serialisiert aktualisiert.
Zu jedem Zeitpunkt läuft höchstens ein `index_repository`-Prozess. Lesende MCP-Tools (`search_graph`,
`trace_path`, `get_code_snippet`, `query_graph`) greifen stale-tolerant auf die persistierte SQLite-Datenbank
unter `~/.cache/codebase-memory-mcp/` zu und blockieren nicht.

## Symptome einer Index-Stampede

- System-Load steigt extrem an (z. B. Referenz-Vorfall vom 2026-08-24 mit Load 54.5 bei 8 parallelen Workern).
- Mehrere Prozesse vom Typ `codebase-memory-mcp cli index_repository` laufen parallel in der Prozessliste.
- Hängende `freshness:check`- oder `test:changed`-Läufe durch Ressourcenerschöpfung der 4-Kern-CPU.

## Akut-Mitigation

1. **Diagnose vor Aktion:**
   Nicht blind reindizieren! Zuerst den Status und Drift mit den schnellen MCP-Kommandos abfragen:
   ```bash
   codebase-memory-mcp cli index_status --project home-patrick-Bachelorprojekt
   codebase-memory-mcp cli detect_changes --project home-patrick-Bachelorprojekt
   ```
   - `index_status` (~10 ms) liefert das Index-Alter.
   - `detect_changes` (~1,4 s) prüft git-basiert auf tatsächliche Dateiänderungen.

2. **Laufende Stampede stoppen:**
   Getötete Worker können durch überwachende Parent-Prozesse respawnen — die Schleife bricht erst,
   wenn alle unerwünschten Prozesse beendet und zukünftige Läufe serialisiert werden:
   ```bash
   # Laufende Indexer identifizieren
   ps aux | grep '[c]odebase-memory-mcp.*index_repository'

   # Geordnet beenden (SIGTERM)
   pkill -f 'codebase-memory-mcp.*index_repository' || true
   sleep 2

   # Load-Beobachtung
   uptime
   ```

3. **Einzel-Lauf nach Beruhigung:**
   Sobald der Load normalisiert ist, darf genau EINE Session den Index aktualisieren:
   ```bash
   task codebase:refresh
   ```

## Prävention

1. **Single-Flight-Serialisierung:**
   Alle automatisierten und manuellen Index-Aufrufe laufen ausschließlich über den Wrapper:
   ```bash
   scripts/mcp/cbm-single-flight.sh '<json-args>'
   ```
   Dieser setzt ein blockierendes `flock` auf `$HOME/.cache/codebase-memory-mcp/cbm-index.lock`.
   Targets in `Taskfile.yml` (`task codebase:index` und `task codebase:refresh`) binden diesen
   Wrapper standardmäßig ein.

2. **Automatisierter Cron-Refresh mit Skip-if-fresh:**
   Der periodische Cron-Job `scripts/cbm-refresh-cron.sh` prüft vor jedem Reindex per
   Helper-Status (`index_status` und `detect_changes` plus Receipt). Nur explizit frisch
   wird via `fresh-skip` übersprungen; unbekannte Evidenz meldet `unknown` mit Exit 1.

3. **Betriebliche Grenzen:**
   Auf der lokalen 4-Kern-Box gilt die strikte Regel: Maximal ein indexierender Prozess.
   Parallele Worktrees greifen auf denselben K3-Graphen zu und dürfen keine eigenen
   parallelen Reindexe auslösen.

## Freshness-Report und Receipts (T900805)

Konservativer Read-only-Status ohne Fetch oder Index:

```bash
python3 scripts/mcp/cbm-freshness.py status --repo "$(git rev-parse --show-toplevel)" --project home-patrick-Bachelorprojekt --timeout 30
```

Antwort: ein JSON-Objekt mit `status` (`fresh`/`stale`/`unknown`), `reasons`,
Checkout-Root/HEAD, lokalem `origin/main`-Stand, eindeutigen Dirty-/Untracked-Pfaden,
Graph-Metadaten (`index_status`, `detect_changes`), erfolgreichem Index-Receipt und
`refresh_allowed`. Fehlende, fehlgeschlagene oder fehlerhafte Proben ergeben nie `fresh`.

Der Wrapper `scripts/mcp/cbm-single-flight.sh` hält sein `flock` und schreibt nur bei
stabilem Erfolg (CLI-Exit 0, valides Ergebnis ohne Tool-Fehler, unveränderter
Vorher-/Nachher-Fingerprint, passende Root/Projekt-Identität) atomar einen Receipt
ausserhalb des Repos. Fehlversuche bewahren den vorherigen Receipt; ein separater
Attempt-Marker (`in_progress`/`failed`/`success`) verhindert Vertrauen in alte Receipts
nach Teilschreibungen. Ein identischer Dirty-Snapshot kann `fresh` mit `dirty=true`
sein, ohne sauberen Checkout zu behaupten.

Exit-/Status-Vertrag Cron: `fresh-skip`/`would-refresh`/`refreshed` mit Exit 0,
`unknown` mit Exit 1, ungültige Argumente mit Exit 2. `stdout` trägt genau ein JSON.
`--dry-run` indiziert nie. Fehlender Receipt meldet `unknown` mit `initial-refresh`;
die Ersteinrichtung läuft nur bei valider Ziel-Identität und funktionierenden Proben
über den Wrapper. Lokaler Upstream-Vorsprung allein löst keinen Reindex aus und führt
keinen Fetch durch; Root-/Projekt-Mismatch oder fehlendes Tool verbieten Refresh.

Erster Refresh nach Receipt-Verlust:

```bash
task codebase:refresh
python3 scripts/mcp/cbm-freshness.py status --repo "$(git rev-parse --show-toplevel)" --timeout 30 | jq '{status, reasons, refresh_allowed}'
```

## Failover-Verhalten bei Index-Ausfall (T002430, Defekt D5)

Der K3-Graph ist eine Beschleunigung, keine harte Abhaengigkeit — Ausfall
bedeutet "langsamer/strukturlos", nie "falsch gruen". Die Vertrage:

| Ausfall | Verhalten | Erholung |
|---|---|---|
| CLI fehlt (`tool-missing`) | `status` = `unknown`, `refresh_allowed=false`; Health-Ziel G-K3FRESH/G-K3PROJ meldet 0 (gelb), nie gruen | Tool installieren (`codebase-memory-mcp install`), danach initialen Refresh |
| Probe haengt (`probe-timeout`) | `unknown` — Timeouts sind gebunden, kein Endlos-Warten | Ursache klären (Daemon/Pod), Refresh läuft nach `refresh_allowed` |
| Refresh schlaegt fehl | `attempt`-Marker `failed` verwirft alte Receipts nicht, blockiert aber `fresh` bis ein Versuch erfolgreich ist | Wrapper erneut ausfuehren (`task codebase:refresh`), Single-Flight-Lock verhindert Stampede |
| Graph-DB extern ersetzt/mutiert | `db-changed` — Receipt wird verworfen | Neuer initialer Refresh (`task codebase:index`) |
| Receipt fehlt komplett | `unknown` + `initial-refresh`, Refresh ist erlaubt | Ein erfolgreicher Lauf etabliert den initialen Receipt |
| Worktree-Checkout | Werkzeug kanonisiert Root auf den Haupt-Checkout; Common-Git-Dir-Gleichheit wird akzeptiert (T002430), `fresh` bleibt erreichbar | — |

G-K3FRESH/G-K3PROJ sind bewusst `target`-Zeilen (gelb bei Verletzung): der
Betriebszustand der Index-Infrastruktur darf sichtbar sein, ohne lokale/CI
Gate-Läufe zu brechen. Ein `unknown`/`stale` Zustand ist damit nie unsichtbar,
aber auch niemals falsch als gruen deklariert.

## Referenzen

- Wrapper: `scripts/mcp/cbm-single-flight.sh`
- Cron-Job: `scripts/cbm-refresh-cron.sh`
- Helper: `scripts/mcp/cbm-freshness.py status --repo PATH --project NAME --timeout SECONDS`
- Taskfile: `task codebase:index`, `task codebase:refresh`
