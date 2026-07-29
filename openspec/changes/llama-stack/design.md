## Context

Der GPU-Host (RTX 5070 Ti, 16303 MiB VRAM) bedient den lokalen llama.cpp-Stack für die Software
Factory und für interaktive Harness-Nutzung (Claude Code, opencode, agy). Zwei
Prozessverwaltungen existieren nebeneinander:

- **Windows-PowerShell-Seite** (`scripts/llm/*.ps1`): Gemma 4 12B (:8091), bge-m3 (:8095),
  Reranker (:8096) und das Batch-Paar (:8085/:8086, aktuell tot). Autostart über den
  Windows-Startup-Ordner (kein Scheduled Task möglich — der Host ist AzureAD-gejoined und
  MDM-verwaltet, T002276). Ein eigener Watchdog-Prozess (`watchdog-llm-servers.ps1`) pollt
  `/health` + Listener-Port alle 60s und startet tote Server neu.
- **Linux-Loadout-Seite** (`scripts/llm-proxy/`): gpt-oss 20b (:8098) und Devstral (:8099),
  deklarativ in `loadouts.json` konfiguriert, über `systemd-run --user` als transiente Units
  gestartet/gestoppt via `/admin/loadouts/<slug>/start|stop`. Kein Autorestart bisher — eine
  fehlgeschlagene Unit bleibt tot, bis jemand `/start` erneut aufruft. Zwei weitere Loadout-
  Einträge (`bge-embed-batch`, `bge-rerank-batch`) existieren bereits für die Ports 8085/8086,
  sind aber aktuell nicht aktiv — sie überschneiden sich mit den (toten) Windows-Batch-Skripten
  auf denselben Ports; dieser Widerspruch wird hier nicht aufgelöst (siehe Non-Goals).

Live-Verifikation am 2026-07-29: `~/opt/llama-b10155-cuda13.3/bin/llama-server --help` listet
`--spec-type draft-mtp` — derselbe Build, den der llm-proxy für gpt-oss/Devstral nutzt, kann also
Gemmas MTP-Speculative-Decoding bedienen. Der llm-proxy selbst läuft bereits produktiv als
Hintergrundprozess auf diesem Host (PID im laufenden Betrieb bestätigt) und hat aktuell 2332 MiB
freies VRAM, weil Gemma geladen ist (~14 GB belegt).

Die Routing-Registry (`getBackends()` in `backends.mjs`, DB-gespeist aus
`tickets.provider_config`) und die Loadout-Registry (`loadouts.json`) sind getrennte
Datenquellen. Ein gestartetes Loadout wird nicht automatisch über `/v1/chat/completions` routbar,
außer ein DB-Eintrag zeigt bereits auf denselben Port. Für Gemma existiert dieser DB-Eintrag
bereits (Port 8091, unabhängig davon, welcher Prozess dort lauscht) — das vereinfacht die
Migration, weil kein Registry-Change nötig ist, solange beide neuen Gemma-Loadouts denselben Port
8091 belegen.

## Goals / Non-Goals

**Goals:**
- Gemma läuft über das Linux-Loadout-System mit `-fit`-basierter Speichersicherheit statt hartem
  `-fit off`.
- Ein Operator kann zwischen Single-Agent-Full-Context und Shared-Multi-Subagent-Full-Context
  wechseln, ohne `.ps1`-Argumente von Hand zu ändern.
- Alle Loadout-verwalteten Modelle (Gemma, gpt-oss, Devstral) starten nach einem Absturz
  automatisch neu, ohne Polling-Watchdog.
- Eine Anfrage an ein konfiguriertes, aber gestopptes, konfliktfreies Modell wird nicht abgelehnt,
  sondern löst einen Auto-Start aus und wartet.

**Non-Goals:**
- Automatisches Verdrängen eines laufenden Chat-Modells zugunsten eines anderen (z. B. Gemma
  stoppen, um gpt-oss zu starten) — bleibt manuell (`/admin/loadouts/<slug>/stop`).
- Migration von bge-m3/Reranker (interaktiv, :8095/:8096) in das Loadout-System — laufen stabil,
  nicht angefasst.
- Reparatur des toten Batch-Paars (:8085/:8086) — eigener Bug, nicht Teil dieses Changes.
- Modell-Routing-Politik (A2), Harness-Werkzeugzuordnung (A4), MCP-Migration (A5) — eigene
  Kind-Tickets unter T002459.
- Laufzeit-Umschichtung VRAM→RAM oder dynamisches Kontext-Wachstum während einer laufenden
  Session — laut Epic-Befund B4 mit llama.cpp technisch nicht umsetzbar (Layer-Verteilung und
  KV-Cache-Allokation passieren nur beim Start).

## Decisions

### D1 — Zwei Loadout-Slugs statt eines Modus-Parameters

`gemma-factory` (`-np 1 -c 65536`) und `gemma-multiagent` (`-np 5 -c 200000 -kvu`) sind zwei
eigenständige Einträge in `loadouts.json`, beide an Port 8091. Der bestehende `portInUse()`-Check
in `server.mjs` verhindert bereits, dass zwei Loadouts denselben Port gleichzeitig belegen — ein
Start von `gemma-multiagent` schlägt mit 409 fehl, solange `gemma-factory` läuft, und umgekehrt.

**Alternative verworfen**: ein einzelner `gemma`-Loadout mit einem Request-Parameter für das
Profil. Hätte einen neuen Mechanismus gebraucht (Loadouts sind heute statische Konfiguration,
kein Runtime-Parameter beim Start); zwei Slugs nutzen ausschließlich vorhandene Mechanik.

### D2 — Lokaler Speculative-Draft-Pfad als neues Loadout-Feld

`loadout.speculative` bekommt `draftModelPath` (absoluter oder modelRoot-relativer Pfad) neben
dem bestehenden `draftHfRepo`. `buildServerArgv` in `runner.mjs` nutzt `--spec-draft-model` statt
`--spec-draft-hf`, wenn `draftModelPath` gesetzt ist. Analog bekommt `loadout.args` ein
`mmprojPath`-Feld für `--mmproj`. Beide Felder sind optional und wirken nur, wenn gesetzt — kein
Verhalten für bestehende Loadouts (gpt-oss, Devstral) ändert sich.

**Alternative verworfen**: Draft-Modell und mmproj über `extraArgs` reichen. Funktioniert
technisch, verliert aber die Pfadauflösung gegen `modelRoots` (`resolveModelPath`), die für das
Hauptmodell bereits existiert — der Draft-Head und der mmproj-Tower liegen im selben Verzeichnis
wie das Hauptmodell und sollten denselben Auflösungsmechanismus nutzen, sonst bricht ein
Root-Wechsel (z. B. neuer `modelRoots`-Eintrag) nur einen Teil der Pfade.

### D3 — Autorestart über systemd-Properties, kein neuer Watchdog

`buildStartCommand` bekommt `--property=Restart=on-failure --property=RestartSec=5` am
`systemd-run`-Aufruf. systemd übernimmt damit den Neustart nativ, ohne dass der llm-proxy selbst
pollen muss.

**Alternative verworfen**: ein zum PowerShell-Watchdog analoger Polling-Prozess auf der
Linux-Seite. systemd bietet dieselbe Garantie nativ und ohne zusätzlichen Prozess — der einzige
Grund, warum die Windows-Seite einen eigenen Watchdog braucht, ist das Fehlen von Scheduled
Tasks/nativer Prozess-Supervision auf dem MDM-verwalteten Host (T002276); dieser Grund entfällt
auf der Linux-Seite, wo systemd zur Verfügung steht.

**Achtung Nebenwirkung**: `--collect` (bereits gesetzt) räumt eine fehlgeschlagene Unit weg, damit
der Unit-Name für einen manuellen Neustart frei bleibt. `Restart=on-failure` mit `--collect`
zusammen bedeutet: systemd versucht selbst neu zu starten, *bevor* die Unit in den
"failed"-Endzustand fällt; `--collect` greift erst, wenn alle Restart-Versuche endgültig
gescheitert sind. Kein Konflikt zwischen beiden Properties, aber im Test explizit zu verifizieren
(mehrfacher `RestartSec`-Zyklus, dann `--collect`-Aufräumung nach endgültigem Scheitern).

### D4 — Konfliktprüfung über `exclusiveGroup`, keine Präferenz-Rangfolge

Neues optionales Feld `exclusiveGroup` in `loadouts.json` (String, z. B. `"chat-gpu"`). Vor einem
Auto-Start prüft `proxyV1`, ob ein anderes Loadout derselben Gruppe aktiv ist. Ist das der Fall:
409 mit Klartext-Hinweis, welches Loadout zuerst gestoppt werden muss. Kein automatisches Stoppen,
keine Priorisierung nach Ticket-Gewicht (das wäre A2 — Routing-Politik, explizit nicht Teil dieses
Changes).

### D5 — Cutover mit dokumentiertem, nicht automatisiertem Rollback

`start-gemma-server.ps1` bleibt unverändert im Repo liegen (kein Löschen). Der Rollback-Pfad bei
Problemen mit dem neuen Loadout-Betrieb ist manuell: den Gemma-Eintrag in
`watchdog-llm-servers.ps1`s `$Servers`-Array wieder einfügen (Git-Revert des Cutover-Commits
genügt) und `.\scripts\llm\start-gemma-server.ps1` erneut ausführen. Keine Feature-Flag-Logik, die
zwischen beiden Betriebsarten automatisch umschaltet — das würde zwei parallel funktionsfähige
Startpfade für denselben Port dauerhaft am Leben halten und genau die Doppelverwaltung
verlängern, die dieser Change beseitigen soll.

## Risks / Trade-offs

- **[Risk]** Live-Cutover auf produktiv genutztem GPU-Host — ein fehlgeschlagener Loadout-Start
  lässt Gemma für die Factory und alle Harnesses unerreichbar, bis der Rollback greift. →
  **Mitigation**: Cutover-Schritt im Implementierungsplan enthält einen Smoke-Test (Chat-Completion
  mit Tool-Call, analog zu `smokeTestToolCall`) VOR dem Entfernen des Windows-Watchdog-Eintrags;
  Rollback-Befehl (D5) wird im Plan explizit als letzter Schritt dokumentiert, nicht nur implizit
  über Git-Revert.
- **[Risk]** `-fit on` mit `minCtx`/`targetMarginMib` kann bei knappem freiem VRAM einen kleineren
  Kontext wählen als die bisherigen festen 65536/200000 Tokens, ohne dass ein Aufrufer das
  bemerkt. → **Mitigation**: `/admin/loadouts/status` liefert bereits `chosen.ctx` aus `/props` —
  das erfüllt A1s Anforderung "reduzierte Kontextgröße sichtbar, nicht still", ohne neuen Code;
  im Plan wird ein Log-Statement ergänzt, das eine Abweichung vom konfigurierten Ziel-Kontext beim
  Start protokolliert.
- **[Risk]** `exclusiveGroup`-Konflikt-Antwort (409) kann Factory-Requests hart scheitern lassen,
  wenn ein Ticket gpt-oss braucht, während Gemma läuft, und niemand manuell eingreift. →
  **Mitigation**: außerhalb des Scopes dieses Changes (das ist A2 — Routing-Politik); hier wird
  nur sichergestellt, dass der Fehler klar und sofort sichtbar ist statt eines stillen Timeouts.

## Migration Plan

1. `loadouts.json`/`loadouts.mjs`/`runner.mjs` um die neuen Felder erweitern (D2, D4) — reiner
   Additiv-Change, keine bestehenden Loadouts betroffen. Tests grün, kein Live-Effekt.
2. `gemma-factory` und `gemma-multiagent` in `loadouts.json` eintragen, `exclusiveGroup:
   "chat-gpu"` auch nachträglich auf `gptoss-context` und `devstral-quality` setzen.
3. Autorestart-Property (D3) ergänzen, gegen `gptoss-context` verifizieren (Prozess killen,
   systemd-Neustart beobachten) — ohne Gemma anzufassen, da noch nicht migriert.
4. Auto-Start-Queue (D4) in `proxyV1` bauen, gegen `devstral-quality` (aktuell inaktiv, kein
   Live-Risiko) verifizieren.
5. **Cutover-Fenster**: `gemma-factory` über `/admin/loadouts/gemma-factory/start` starten,
   Smoke-Test fahren, danach erst den Windows-Gemma-Prozess stoppen und den Watchdog-Eintrag
   entfernen. Bei Fehlschlag: Rollback laut D5, Windows-Prozess bleibt/läuft weiter.

## Open Questions

Keine offenen Fragen — beide im Brainstorming offenen Punkte (Feld-Schema für lokale Pfade,
Rollback-Mechanik) sind in D2 und D5 entschieden.
