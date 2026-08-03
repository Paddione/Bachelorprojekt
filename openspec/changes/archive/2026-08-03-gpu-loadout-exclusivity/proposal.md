# Proposal: gpu-loadout-exclusivity

## Why

Der Exklusivitätsmechanismus existiert bereits und ist korrekt: `loadouts.json` führt
`exclusiveGroup` (alle sechs GPU-Loadouts in `chat-gpu`, die beiden bge in `bge-cpu`),
`planAutoStart()` in `loadouts.mjs` erkennt den Konflikt, und `proxyV1()` antwortet mit
HTTP 409 `exclusive_conflict` samt Stop-Befehl.

Er greift aber nur auf **einem** der beiden Startwege.

| Weg | Einstieg | exclusiveGroup geprüft? |
|---|---|---|
| Auto-Start über Modellauflösung | `POST /v1/*` → `ensureLoadoutForModel` → `planAutoStart` | **ja** — 409 `exclusive_conflict` |
| Expliziter Start | `POST /admin/loadouts/<slug>/start` → `startLoadout` | **nein** |

`startLoadout()` (`server.mjs:235`) prüft `already_running` (409) und `port_busy` (409) — aber
keinen Gruppenkonflikt. `port_busy` fängt den Fall nur zufällig ab, wenn zwei Loadouts denselben
Port teilen (`gemma-factory`/`gemma-multiagent`/`gemma26-factory` auf 8091). Über Portgrenzen
hinweg greift nichts: bei laufendem `gemma9-factory` (Port 8092) startet
`POST /admin/loadouts/gemma26-factory/start` (Port 8091) heute durch.

Das ist kein theoretischer Fall. Auf der RTX 5070 Ti (16 GB) wiegt `gemma26-factory` allein
14,25 GB, `gemma9-factory` 5,76 GB. llama.cpp meldet dabei **keinen** VRAM-Fehler — `--fit`
lagert still Layer ins RAM aus. Beide Server laufen, beide antworten, beide sind zäh, und keine
Meldung nennt die Ursache. Messreferenz T002534: schon 6 von 30 ausgelagerten Layern kosten
Faktor 7 beim Decoding (166 → 21,5 tok/s).

## What

Den vorhandenen Konfliktbegriff auf den zweiten Startweg ziehen — kein neues Konzept, kein
neues Feld.

1. Die Konfliktsuche aus `planAutoStart()` als eigene exportierte Funktion
   `findExclusiveConflict(doc, slug, activeSlugs)` in `loadouts.mjs` herauslösen.
   `planAutoStart` ruft sie danach selbst auf, damit es genau **eine** Definition von
   „Konflikt" gibt statt zweier, die auseinanderlaufen können.
2. `startLoadout()` prüft sie, direkt neben dem bestehenden `port_busy`-Check, und wirft
   `LoadoutStartError(409, 'exclusive_conflict', …)` mit derselben Wortwahl wie der
   `/v1`-Pfad: blockierender Slug, Gruppe, Stop-Befehl, kein automatisches Stoppen.

Ein Loadout, das bereits selbst läuft, bleibt kein Konflikt — dafür gibt es weiterhin
`already_running`, und `findExclusiveConflict` schließt den eigenen Slug aus.

### Bekannte Grenzen

Unverändert gegenüber dem bestehenden Mechanismus, hier nur benannt:

1. **Nur systemd-User-Units sind sichtbar.** Ein von Hand gestarteter `llama-server` oder der
   Windows-Pfad `scripts/llm/start-gemma-server.ps1` (seit T002459 entwidmet, nur noch
   Break-Glass) bleibt unsichtbar.
2. **Kein Lock.** Zwischen Prüfung und `systemd-run` liegt ein Zeitfenster; zwei exakt
   gleichzeitige Starts können durchrutschen. Auf einem manuell bedienten Einzelplatz-Host
   wäre ein Lock mehr Maschinerie als Problem.

_Ticket: T002616_
