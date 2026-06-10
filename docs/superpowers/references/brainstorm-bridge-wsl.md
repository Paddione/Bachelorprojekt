# Brainstorm-Bridge (WSL) — Visuals & Auswahl an den Nutzer kommunizieren

**Kontext:** Der Dev-Node ist endgültig diese WSL-Maschine, und sie läuft im
**mirrored networking mode** — `eth0` trägt die echten Host-IPs direkt (Tailscale,
wg-mesh, LAN), kein NAT-172.x. Ein Server, der in WSL auf **`0.0.0.0`** lauscht, ist
darum **gleichzeitig über alle Wege** erreichbar. **localhost ist nur einer davon.**

> Anforderungen des Nutzers: *„muss auch ohne localhost funktionieren"* + *„muss ich
> spezielle Ports öffnen?"* → **Ohne localhost: ja, via Tailscale. Ports öffnen: nein.**

## Brauche ich Ports öffnen? **Nein.**

Tailscale ist ein WireGuard-Mesh-VPN: Peers verbinden sich **durch NAT/Firewall hindurch**
(DERP-Relay + NAT-Traversal). Es gibt **nie** ein Router-Port-Forwarding. Die App-Portnummer
ist nur auf dem Tailnet-Interface sichtbar. **`tailscale serve`** terminiert die Verbindung
sogar im Tailscale-Prozess (Windows) und proxyt nach localhost → **keine eingehende
App-Port-Exposition, kein Windows-Firewall-Thema, kein Portnummer-Anhängsel, echtes HTTPS.**
Einziger theoretischer Türsteher beim *rohen* Port wäre die Windows Defender Firewall auf
dem WSL-Port — `serve` umgeht auch das. Darum ist `serve` der empfohlene Nicht-localhost-Weg.

## Transport-Tiers (Server bindet immer `0.0.0.0`, fester Port 47600)

| Weg | URL | Wann | Ports? |
|-----|-----|------|--------|
| **localhost** | `http://localhost:47600` | Auf diesem Desktop (auto-geöffnet). | – |
| **Tailscale serve (empfohlen)** | `https://pk-desktop.tail8a4425.ts.net/` | **Handy/Laptop, überall.** Port-los, HTTPS, von `start` auto-verdrahtet. | **keine** |
| Tailscale MagicDNS (roh) | `http://pk-desktop.tail8a4425.ts.net:47600` | Fallback, wenn serve mal aus ist. | keine (evtl. Win-FW) |
| Tailscale IP | `http://100.102.71.114:47600` | Jedes Tailnet-Gerät. | keine |
| LAN / wg-mesh | `http://192.168.100.10:47600` / `10.10.0.3` | Gerät im selben Netz / Mesh-Peer. | keine |
| **Tailscale Funnel** | `https://pk-desktop.tail8a4425.ts.net/` | **Öffentlich** — Viewer *ohne* Tailscale (gekko). Ersetzt den fragilen sish-Cluster-Tunnel. **Braucht Nutzer-OK.** | keine |

Tailnet `tail8a4425.ts.net`, Node `pk-desktop` = `100.102.71.114`. `serve` ist tailnet-only;
bestehende fremde serve-Maps (z. B. `:9878`) bleiben unberührt (additives `--https=443`).

## Entscheidungsbaum — welches Werkzeug für welches Bedürfnis

| Bedürfnis | Werkzeug | Warum |
|-----------|----------|-------|
| **Auswahl** — Worte/Optionen, ≤ 4, evtl. Multiselect | **`AskUserQuestion`** (Harness-Tool) | Null Infrastruktur, inline. `preview` für ASCII-Mockup/Code/Diagramm side-by-side. **Default für reine Auswahlen.** |
| **Gerendertes Visual** — Mockup/Wireframe/Layout + Klick-Feedback | **Visual Companion** via `brainstorm-bridge.sh` | Echtes HTML, in-place iterierbar, Klick-Events zurück. MIT und OHNE localhost. |
| **Statisches Bild** — PNG/SVG/Diagramm/Screenshot, keine Interaktion | **`SendUserFile`** (Harness-Tool) | Schiebt das Artefakt direkt in den Chat. Kein Browser/Server. Geräteunabhängig. |
| **Viele Textfragen** — Grilling (3+ Fragen) | **HTML-Formular** + `brainstorm-bridge.sh show` | Batch, `localStorage`-Speichern, „Markdown kopieren". Siehe `feedback-grilling-html-form`. |
| **Remote-Mitleser** — gekko live | **Tailscale Funnel** oder `task brainstorm:collab` (sish) | Funnel ist robuster (kein Cluster nötig). |

**Faustregel:** Pro *Frage* entscheiden, nicht pro Session. Test: *Versteht der Nutzer es
besser, wenn er es **sieht**?* „Was heißt X?" = Terminal/AskUserQuestion; „Welches Layout?" = Browser.

## Werkzeuge im Repo

### `scripts/brainstorm-bridge.sh` — Ein-Kommando-Front-End
```bash
scripts/brainstorm-bridge.sh start        # Companion (0.0.0.0, fester Port 47600), 'tailscale serve'
                                           # verdrahten, localhost auto-öffnen, volles URL-Menü + screen_dir/state_dir
scripts/brainstorm-bridge.sh urls         # URL-Menü erneut drucken (z. B. serve-URL für's Handy)
scripts/brainstorm-bridge.sh show f.html  # HTML-Fragment in die aktive Session legen (Board lädt neu)
scripts/brainstorm-bridge.sh choice       # letzte vom Nutzer geklickte {"choice":...}
scripts/brainstorm-bridge.sh funnel       # ÖFFENTLICHES HTTPS (tailscale funnel) — nur mit Nutzer-OK
scripts/brainstorm-bridge.sh stop         # Server stoppen + serve-Map (443) entfernen
```
Robustheit: **fester Port 47600** (→ stabile serve-URL über Sessions; überschreibbar via
`BRAINSTORM_BRIDGE_PORT`), Fallback auf freien Port bei Belegung, Start-Retry gegen den
mirrored-mode-EADDRINUSE (Windows-Ports sind in WSL sichtbar).

### `scripts/wsl-open.sh` — WSL→Windows-Browser-Brücke
```bash
scripts/wsl-open.sh http://localhost:47600    # URL -> Windows-Default-Browser
scripts/wsl-open.sh /tmp/grilling-foo.html    # lokaler Pfad -> file:// via wslpath
```
Opener-Reihenfolge: `cmd.exe /c start` (aus `/mnt/c`, vermeidet UNC-Warnung) →
`powershell.exe Start-Process` → `explorer.exe` → `wslview`.

### Direkter Companion-Loop (wenn ich Fragmente selbst schreibe)
HTML-Fragmente per **Write-Tool** direkt nach `<screen_dir>` (NIE cat/heredoc); der Server
serviert die neueste Datei automatisch und broadcastet `reload`. Klicks → `<state_dir>/events`
(WebSocket), Rücklesen via `scripts/brainstorm-extract-choice.sh <state_dir>`.

## Was NICHT mehr nötig ist
- **Keine Ports öffnen** — Tailscale tunnelt selbst; `serve` braucht nicht mal den rohen Port.
- **Kein manuelles URL-Kopieren** — `start` öffnet localhost und druckt die serve-URL für andere Geräte.
- **Kein sish-Cluster-Tunnel als Default** — nur Fallback für Nicht-Tailscale-Viewer; Funnel ist der robustere Ersatz.

## Verwandt
- `skills/brainstorming/visual-companion.md` (superpowers) — Companion-Details, CSS-Klassen, Event-Format
- `scripts/brainstorm-extract-choice.sh` — Choice-Rückkanal
- Memory `feedback-grilling-html-form`, `project_collab_brainstorm_tunnel`
