---
title: "llama-stack: Gemma-Migration in den Loadout-Stack, Autorestart, Auto-Start-Queue"
domains: [scripts]
ticket_id: T002459
status: active
---

# llama-stack

**Ticket:** T002459 (EPIC — dieser Change deckt einen Teilscope ab, siehe "Nicht in diesem Change")

## Why

Der lokale llama.cpp-Stack läuft heute in zwei getrennten, nicht koordinierten Welten: Gemma 4
12B, bge-m3 und der Reranker starten über Windows-PowerShell-Skripte (`scripts/llm/*.ps1`),
überwacht von einem eigenen Watchdog-Prozess. gpt-oss 20b und Devstral laufen — wenn überhaupt
gestartet — über ein neueres, deklaratives Loadout-System im `llm-proxy`
(`scripts/llm-proxy/loadouts.json` + `/admin/loadouts/*`), das systemd-Units auf der Linux-Seite
des GPU-Hosts verwaltet. Dieses Loadout-System hat noch keinen Autorestart und kein
automatisches Start-bei-Anfrage — ein Request an ein konfiguriertes, aber gestopptes Modell
schlägt fehl statt zu warten. Gemma ist im Loadout-System bislang gar nicht bekannt.

Live-Verifikation am GPU-Host (2026-07-29) bestätigt: `~/opt/llama-b10155-cuda13.3` — der Build,
den das Loadout-System für gpt-oss/Devstral nutzt — unterstützt bereits `--spec-type draft-mtp`,
denselben Speculative-Decoding-Mechanismus, den bisher nur die Windows-Skripte für Gemma nutzten.
Die Migration von Gemma in das Loadout-System kostet also keine Performance, vereinheitlicht aber
Speichersicherheit (`-fit`), Autorestart und Erreichbarkeit unter einem einzigen, testbaren
Mechanismus statt zwei parallelen.

## What Changes

- Zwei neue Gemma-Loadouts (`gemma-factory`, `gemma-multiagent`) in `loadouts.json`, beide an
  Port 8091, gegenseitig exklusiv über den bestehenden `portInUse()`-Check — das ist der
  Umschalter zwischen Single-Agent-Full-Context (`-np 1`) und Shared-Full-Context-Multi-Subagent
  (`-np 5 -kvu`).
- `loadouts.mjs`/`runner.mjs` um Felder für einen lokalen Speculative-Draft-Modell-Pfad und einen
  mmproj-Pfad erweitert (bisher nur `draftHfRepo`/`draftNgl`, kein lokaler Pfad).
- Speichersicherheit: beide neuen Gemma-Loadouts nutzen `-fit on` mit `minCtx`/`targetMarginMib`
  statt des bisherigen harten `-fit off` mit fixem `-c`.
- Autorestart für **alle** Loadouts (nicht nur Gemma): `buildStartCommand` in `runner.mjs`
  bekommt `--property=Restart=on-failure --property=RestartSec=5` am `systemd-run`-Aufruf.
- Auto-Start-bei-Anfrage + Warteschlange in `proxyV1` (`server.mjs`): eine Anfrage an ein
  bekanntes, aber gestopptes Modell startet dessen Loadout automatisch und hält die Anfrage in
  der bestehenden `enqueue()`-Warteschlange, bis `/health` grün ist — **nur** wenn das Modell zu
  keinem aktuell laufenden Modell in Konflikt steht (neues `exclusiveGroup`-Feld in
  `loadouts.json`). Bei Konflikt (z. B. gpt-oss angefragt, während Gemma läuft): kein
  automatisches Stoppen, sondern eine klare 409-Antwort mit Handlungsanweisung.
- **BREAKING (operativ, nicht API)**: Cutover des Gemma-Starts von Windows-PowerShell auf das
  Linux-Loadout-System. `watchdog-llm-servers.ps1` verliert den Gemma-Eintrag,
  `install-startup-autostart.ps1` startet Gemma nicht mehr automatisch.
  `start-gemma-server.ps1` bleibt als dokumentierter Rollback-Pfad liegen.

## Capabilities

- **Modified Capabilities**: `local-llm-proxy` (`openspec/specs/local-llm-proxy.md`) — neue
  Requirements für Autorestart, Auto-Start-Queue und Gemma-Loadouts. Kein neuer Capability-Slug,
  da dies eine Erweiterung des bestehenden llm-proxy-Verhaltens ist (Delta-Spec-Konvention
  T001304 — Datei benannt nach dem Parent-SSOT-Slug `local-llm-proxy`, nicht nach `llama-stack`).

## Impact

- **Code**: `scripts/llm-proxy/loadouts.json`, `scripts/llm-proxy/loadouts.mjs`,
  `scripts/llm-proxy/runner.mjs`, `scripts/llm-proxy/server.mjs`,
  `scripts/llm/watchdog-llm-servers.ps1`, `scripts/llm/install-startup-autostart.ps1`.
- **Betrieb**: Live-Cutover auf dem produktiv von der Factory genutzten GPU-Host — Gemma läuft
  aktuell und wird aktiv angefragt. Braucht einen Rollback-Schritt/Smoke-Test, keinen reinen
  Code-Merge.
- **Nicht in diesem Change** (bleiben eigene Kind-Tickets unter dem Epic T002459): A2
  (Modell-Routing-Politik versionieren), A4 (Harness-Werkzeug-/Rechtezuordnung), A5
  (MCP-Migration klären). Das aktuell tote Batch-Paar (bge-m3-batch :8085, Reranker-batch :8086,
  T002426) ist ein eigener, unabhängiger Bug und wird hier nicht mitgefixt.
