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
   Der periodische Cron-Job `scripts/cbm-refresh-cron.sh` prüft vor jedem Reindex `index_status`
   und `detect_changes`. Liegt kein Drift vor, wird der Lauf via `fresh-skip` übersprungen.

3. **Betriebliche Grenzen:**
   Auf der lokalen 4-Kern-Box gilt die strikte Regel: Maximal ein indexierender Prozess.
   Parallele Worktrees greifen auf denselben K3-Graphen zu und dürfen keine eigenen
   parallelen Reindexe auslösen.

## Referenzen

- Wrapper: `scripts/mcp/cbm-single-flight.sh`
- Cron-Job: `scripts/cbm-refresh-cron.sh`
- Taskfile: `task codebase:index`, `task codebase:refresh`
