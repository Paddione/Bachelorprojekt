# Brainstorm-Bridge (WSL) — Visuals & Auswahl an den Nutzer kommunizieren

**Kontext:** Der Dev-Node ist endgültig diese WSL-Maschine, und sie läuft im
**mirrored networking mode** — `eth0` trägt die echten Host-IPs direkt (Tailscale,
wg-mesh, LAN), kein NAT-172.x. Ein Server, der in WSL auf **`0.0.0.0`** lauscht, ist
darum **gleichzeitig über alle Wege** erreichbar. **localhost ist nur einer davon.**

> Nutzer-Anforderungen: *„muss auch ohne localhost funktionieren"* + *„muss ich Ports
> öffnen?"* + *„öffentliche Zugänglichkeit dauerhaft aktiv halten"* → **ohne localhost: ja
> (Tailscale); Ports öffnen: nein; dauerhaft öffentlich: ja, als gehärteter systemd-Service.**

## Brauche ich Ports öffnen? **Nein.**

Tailscale ist ein WireGuard-Mesh-VPN: Peers verbinden sich **durch NAT/Firewall hindurch**
(DERP + NAT-Traversal). Kein Router-Port-Forwarding, nie. **`tailscale funnel`/`serve`**
terminieren im Tailscale-Prozess (Windows) und proxyen nach `127.0.0.1` → keine eingehende
App-Port-Exposition, kein Windows-Firewall-Thema, echtes HTTPS, port-lose URL.

## Transport-Tiers (Server bindet `0.0.0.0`, fester Port 47600)

| Weg | URL | Wann | Ports? |
|-----|-----|------|--------|
| **localhost** | `http://localhost:47600` | Auf diesem Desktop (auto-geöffnet). | – |
| **Tailscale Funnel (öffentlich)** | `https://pk-desktop.tail8a4425.ts.net/` | **Jedes Gerät, auch ohne Tailscale (gekko).** Port-los, HTTPS, vom Dauer-Service gesetzt. | **keine** |
| Tailscale serve (tailnet-only) | `https://pk-desktop.tail8a4425.ts.net/` | Nur eigene Tailnet-Geräte (statt Funnel). | keine |
| Tailscale IP / MagicDNS (roh) | `http://100.102.71.114:47600` | Tailnet-Fallback. | keine |
| LAN / wg-mesh | `http://192.168.100.10:47600` / `10.10.0.3` | Gerät im selben Netz / Mesh-Peer. | keine |

Tailnet `tail8a4425.ts.net`, Node `pk-desktop` = `100.102.71.114`. `serve`/`funnel` auf `--https=443`
sind **additiv** — die fremde `:9878`-Map (OpenClaw-Gateway, tailnet-only) bleibt unberührt.

## Sicherheit (Public-Board-Härtung, Stand 2026-06-10)

Der Companion-`server.cjs` ist über Funnel **öffentlich + unauthentifiziert**. Multi-Agent-Review
(20/21 Befunde bestätigt): **kein Path-Traversal** (`/files/` nutzt `path.basename`, gegen `../`,
encoded, nullbyte, absolut getestet), **keine RCE/File-Write-Primitive**. Gefixt via idempotentem
Patch `scripts/brainstorm-companion-harden.sh` (marker-guarded, re-anwendbar nach Plugin-Update):

- **MUST-FIX Crash-Kills:** `GET /files/..` (Verzeichnis → EISDIR) crashte den Prozess (kein
  try/catch, kein `uncaughtException`) → `isFile()`-Guard + try/catch + `process.on`-Netz.
  Unbegrenzte WS-Frame-/Akku-Größe → OOM → `MAX_FRAME=64 KB`-Cap.
- **Read-only Public-Modus (`BRAINSTORM_PUBLIC=1`):** Default des Dauer-Service. Besucher sehen
  alles live, können aber **nichts schreiben** — verhindert anonyme Decision-/Prompt-Injection in
  `state/events` (das ist der Entscheidungs-Input des Agenten via `brainstorm-extract-choice.sh`).
- **Limits:** `MAX_CLIENTS=50`, Origin-Allowlist (public), per-Event 4 KB + events-Datei 5 MB Cap
  (greifen im interaktiven Modus). **Residual/Follow-up:** per-Connection-Rate-Limit + Dead-Socket-
  PING-Eviction noch offen (im read-only Public-Modus unkritisch, da keine Client-Writes).
- Inhalt von `CONTENT_DIR` ist **vollständig öffentlich** — nie Secrets/PII dort ablegen.

## Dauerhaft öffentlich: der systemd-User-Service

```bash
scripts/brainstorm-bridge.sh service install   # härtet Companion, installiert+started systemd-User-
                                               # Service auf festem Port 47600 (BRAINSTORM_PUBLIC=1,
                                               # Restart=always, owner=1), loginctl enable-linger,
                                               # Funnel öffentlich → 47600
scripts/brainstorm-bridge.sh service status    # systemctl status + HTTP-Probe + URL-Menü
scripts/brainstorm-bridge.sh service remove     # Service disable + Funnel/serve 443 aus
```
Service-Unit: `~/.config/systemd/user/brainstorm-board.service` (aus `$COMP`/`$BRIDGE_PORT`/`$BOARD_DIR`
generiert → self-tracking nach Plugin-Update via erneutem `service install`). Fester Board-Dir
`.superpowers/brainstorm/board/` (Inhalt überlebt Restarts). `Restart=always` heilt den 30-Min-Idle-
Selbstexit. Funnel-Config liegt Windows-seitig (tailscale.exe) → überlebt WSL/Windows-Reboots.

Wenn der Service läuft, zielen `show`/`choice`/`urls` automatisch auf den Board-Dir, und `start`
konkurriert nicht (Guard).

## Ad-hoc interaktive Session (Klick/Chat, z. B. aktiv mit gekko)

```bash
scripts/brainstorm-bridge.sh start   # Companion (0.0.0.0, fester Port), localhost auto-open, URL-Menü
scripts/brainstorm-bridge.sh show f.html   # HTML-Fragment in die aktive Session (Board lädt neu)
scripts/brainstorm-bridge.sh choice        # letzte vom Nutzer geklickte {"choice":...}
scripts/brainstorm-bridge.sh funnel        # öffentliches HTTPS für die laufende Session
scripts/brainstorm-bridge.sh stop          # Server stoppen + Funnel/serve 443 aus
```
Im interaktiven Modus (ohne `BRAINSTORM_PUBLIC=1`) sind Klick/Chat aktiv — bei öffentlichem Funnel
ist das eine Schreib-Oberfläche; für Entscheidungen den Terminal-Kanal als Wahrheit nehmen.

## Auswahl ans Terminal (Submit-Knopf)

In **jedem** Encounter rendert `helper.js` auf der **localhost**-Seite einen schwebenden
Knopf „✓ Auswahl ans Terminal". Klick → die komplette Maskenauswahl (markierte Optionen +
Formularfelder + Frage) geht per `POST /submit` an einen **separaten, nur an `127.0.0.1`
gebundenen** HTTP-Listener (Default-Port `BRAINSTORM_PORT+1`, **nicht** funnel-gemappt).
Der Listener (a) schreibt `state/submission.json` (mode 600) + eine `events`-Zeile, (b) pusht
den gerenderten Sentinel-Block (`«BRAINSTORM-AUSWAHL» … «ENDE»`) via `clip.exe` in die
Windows-Zwischenablage. Der Nutzer fügt mit **Strg+V** ein und drückt **Enter**.

- **Read-only übers Funnel bleibt garantiert:** der Submit-Port ist nicht gemappt, der Knopf
  rendert nur auf `http://localhost`/`127.0.0.1` (die Funnel-Seite ist `https://<magicdns>` →
  kein Knopf; `https→http`-fetch wäre mixed-content-blockiert). Remote-gekko kann NICHT absenden.
- Auslieferung: `scripts/superpowers-submit-patch.sh` (idempotent, Marker `brainstorm-submit v1`),
  von `service install` und `start` automatisch angewandt.
- Agent zieht die Auswahl bei Bedarf: `scripts/brainstorm-bridge.sh submission` (gibt
  `state/submission.json` aus); `choice` bleibt funktionsfähig.

## Entscheidungsbaum — welches Werkzeug für welches Bedürfnis

| Bedürfnis | Werkzeug | Warum |
|-----------|----------|-------|
| **Auswahl** — Worte/Optionen, ≤ 4 | **`AskUserQuestion`** (Harness-Tool) | Null Infrastruktur, inline, `preview` für ASCII/Code/Diagramm. **Default für reine Auswahlen.** |
| **Gerendertes Visual** + Klick | **Visual Companion** via `brainstorm-bridge.sh` | Echtes HTML, iterierbar, Klick-Events. MIT und OHNE localhost. |
| **Statisches Bild** (PNG/SVG) | **`SendUserFile`** | Direkt in den Chat, kein Browser/Server, geräteunabhängig. |
| **Viele Textfragen** (Grilling) | **HTML-Formular** + `show` | Batch, `localStorage`. Siehe `feedback-grilling-html-form`. |
| **gekko (remote) live** | **Tailscale Funnel** (Dauer-Service) | Öffentlich, kein Cluster nötig — robuster als der alte sish-Tunnel. |

**Faustregel:** Pro *Frage* entscheiden. Test: *Versteht der Nutzer es besser, wenn er es **sieht**?*

## `scripts/wsl-open.sh` — WSL→Windows-Browser-Brücke
```bash
scripts/wsl-open.sh http://localhost:47600    # URL -> Windows-Default-Browser (cmd.exe/powershell/explorer)
```

## Was NICHT mehr nötig ist
- **Keine Ports öffnen** — Tailscale tunnelt selbst.
- **Kein manuelles URL-Kopieren** — `start`/`service` öffnen localhost + drucken die öffentliche URL.
- **Kein sish-Cluster-Tunnel** — Funnel ist der robuste Ersatz für Remote-Viewer.

## Verwandt
- `skills/brainstorming/visual-companion.md` (superpowers) — Companion-Details, CSS, Event-Format
- `scripts/brainstorm-companion-harden.sh` — idempotente Sicherheits-Härtung des Companion
- `scripts/brainstorm-extract-choice.sh` — Choice-Rückkanal
- `scripts/superpowers-submit-patch.sh` — idempotenter Submit-Kanal-Patch (loopback /submit)
- Memory `reference_brainstorm_bridge_wsl`, `feedback-grilling-html-form`, `project_collab_brainstorm_tunnel`
