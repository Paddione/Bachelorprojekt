# Windows-natives Dev-Setup (WSL-Exit, ADR-007)

Nach dem WSL-Exit läuft die Entwicklung Windows-native auf NTFS. Dieses
Runbook führt vom leeren Rechner zum arbeitsfähigen Checkout und hält die
drei P0-Spikes als abhakbare Schritte fest.

> **Gate-Charakter:** Die Spikes sind P0 — ohne grüne Ergebnisse werden die
> Feat-Tickets T016429/T016430/T016433 nicht scharf geschaltet.

## 1. Basis-Setup

- [ ] Git Bash installieren (Git for Windows, inkl. `bash`, `ssh`)
- [ ] Windows **Developer Mode** aktivieren (Einstellungen → Datenschutz &
      Sicherheit → Für Entwickler) — Voraussetzung für Symlinks ohne Admin
- [ ] `git config --global core.symlinks true`
- [ ] `git config --global core.autocrlf input` (LF im Repo bleibt LF)
- [ ] Repo klonen: `git clone git@github.com:Paddione/Bachelorprojekt.git`
- [ ] git-crypt entsperren: Schlüssel `bp-secrets.key` beschaffen,
      `git-crypt unlock /pfad/zu/bp-secrets.key`
- [ ] Gegenprobe: `bash scripts/factory/wakeup.sh --help` liefert Usage ohne
      `\r`-Fehler

## 2. P0-Spike A — opencode-Windows-Viability

Ziel: opencode läuft nativ unter Windows (nicht WSL).

- [ ] opencode für Windows installieren (npm-global oder Binary)
- [ ] `opencode` in einem NTFS-Checkout starten; Agent-Antwort beobachten
- [ ] Plugin `.opencode/plugin/freetoken-active.ts` lädt (FreeToken :1919
      erreichbar oder Fehler sauber behandelt)
- [ ] Ein Werkzeugaufruf (Datei lesen + bash) erfolgreich

**Messnotiz** anlegen: `scripts/llm/measurements/2026-MM-DD-opencode-windows-viability.md`
(Versionen, Startzeit, Fehlerbilder, Go/No-Go).

## 3. P0-Spike B — NTFS-Clone mit Symlinks + git-crypt

Ziel: Der Clone auf NTFS ist voll funktionsfähig.

- [ ] `git ls-files -s | grep ^120000` — Symlink-Einträge im Repo identifizieren
- [ ] Nach Clone: prüfen, dass Symlinks als Links vorliegen (`ls -l`,
      Developer Mode aktiv?)
- [ ] `git-crypt unlock` erfolgreich; verschlüsselte Dateien lesbar
- [ ] `task test:changed` läuft durch (Node/Bash-Toolchain unter Windows)
- [ ] `.gitattributes` eol=lf-Guard greift: keine CRLF-Diff-Bomben
      (`git diff --stat` nach Touch einer .sh)

**Messnotiz**: `scripts/llm/measurements/2026-MM-DD-ntfs-clone-gitcrypt.md`.

## 4. P0-Spike C — Fleet→Windows:1919 über wg/NAT

Ziel: FreeToken (:1919 auf dem Windows-Desktop) ist aus dem Fleet erreichbar.

- [ ] WireGuard-Peer des Fleet-Knotens kann `wg <windows-ip>` erreichen
      (NAT/Firewall-Regel auf dem Heim-Router bzw. wg-AllowedIPs prüfen)
- [ ] Von einem Fleet-Node: `curl http://<windows-wg-ip>:1919/v1/models`
      antwortet
- [ ] Firewall-Regel auf Windows: eingehend 1919 nur aus dem wg-Subnetz
- [ ] Latenz messen und notieren (für Timeout-Setzungen im factory-runner)

**Messnotiz**: `scripts/llm/measurements/2026-mm-dd-fleet-to-windows-1919.md`.

## 5. Abschluss

- [ ] Drei Messnotizen existieren und sind verlinkt in den jeweiligen
      Feat-Tickets (T016429/T016430/T016433)
- [ ] Erst dann: `wsl --shutdown` laut Checkliste in
      [`docs/archive/WSL-BOOTSTRAP.md`](archive/WSL-BOOTSTRAP.md#shutdown-checkliste-wsl-exit-adr-007)
