# Proposal: glimmer-worker-mcp

## Why

Muse Code (Metas Coding-CLI, auf WSL und Windows installiert) plant auf Muse Spark 1.3. Das lokale Muse
Glimmer 30B auf `:1919` (T900365) ist aus Spark destilliert und soll für Muse als Arbeitermodell dienen:
Spark plant und prüft, Glimmer führt abgegrenzte Teilaufgaben lokal und kostenlos aus. Ein direkter Anschluss
als Muse-Provider scheitert am proprietären Meta-Protokoll (gemessen, siehe `design.md`).

## What

- Neuer MCP-Server `scripts/glimmer-worker-mcp/` (Node-stdlib, Streamable HTTP auf `127.0.0.1:13007`, Bearer)
  mit den Tools `glimmer_worker_start`, `glimmer_worker_result` und `glimmer_worker_status`. Ein Job führt
  opencode mit dem Agenten `glimmer-primary` im Ziel-Repo aus und liefert Zusammenfassung, `git status` und
  Diff-Statistik zurück. Jobs laufen nacheinander (ein Slot auf `:1919`).
- Windows-Pfade und `\\wsl.localhost\…` werden übersetzt; das Ziel muss ein Git-Arbeitsbaum sein.
- systemd-User-Unit und Installer, der den Server in beide Muse-`settings.json` einträgt (WSL und Windows;
  Windows erreicht WSL über mirrored networking). Task `llm:glimmer-worker:install`.
- Bewusst **nicht** in der MCP-Registry, damit opencode/Glimmer sich nicht selbst beauftragen.

_Ticket: T900373_
