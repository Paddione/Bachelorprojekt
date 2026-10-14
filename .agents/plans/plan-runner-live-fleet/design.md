# plan-runner-live-fleet — Design

Problem: Der plan-runner hängt an Endpunkten, die nicht mehr laufen (`:1919` deaktiviert, `:8080` entfernt). Der einzige lebende lokale Worker-Endpunkt (vLLM `:8123`, 32k) ist über opencode nicht nutzbar, weil die Sitzung das Fenster sprengt.

Lösung:
- Direkt-Worker: schlanker Tool-Loop im Runner-Prozess gegen `:8123`. Fünf Tools (`read_file`, `write_file`, `replace_in_file`, `run_command`, `finish`), Schreibrechte nur für die `target_files` des Partials, Befehle per Allowlist ohne Shell. Kontext bleibt klein, weil kein opencode-System-Prompt, keine MCP-Schemas und keine Skills mitgeschickt werden.
- Cloud-Fallback: opencode-Agent `plan-worker-muse` auf Muse Spark 1.3 (Go-Abo). Für Partials, die der 4B-Direkt-Worker nicht schafft.
- Self-Track nur, wenn `:1919` antwortet.
- Orchestrator fällt von `:1919` auf `:8123` zurück. Der Tool-Loop läuft dort seit dotfiles #130 (Tool-Parser `qwen3_coder`).
- Preflight für jeden Track, tote Tracks bekommen 0 Slots.

Verworfen:
- 2B-Pool `:8096` als Worker: 16k Kontext, für Tool-Loops zu schwach (siehe Kommentar in `decideTrack`).
- `:1919` dauerhaft starten: teilt sich die RTX 5070 Ti mit vLLM (`gpu-memory-utilization 0.72`).
- opencode-Sitzung für w4a4 verschlanken: hängt an globaler Config, Skills und MCPs, die andere Agents brauchen.
