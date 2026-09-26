---
title: "warden-mcp — Design"
ticket_id: T900404
plan_ref: openspec/changes/warden-mcp/tasks.md
status: approved
---

# warden-mcp — Design

## Goals

- Claude Code kann Vaultwarden-Einträge des Nutzers suchen, lesen (Secrets nur mit `reveal:true`)
  und anlegen/ändern/löschen.
- Kein Credential im Repo — weder Klartext, noch git-crypt, noch `${VAR}`-Platzhalter in getrackten
  Configs.
- Jede mutierende Operation braucht eine explizite Bestätigung im Permission-Dialog des
  jeweiligen Harness (Claude Code: `permissions.ask`, opencode: `permission` = `ask`).
- Auch opencode kommt an den Tresor — der Server soll am Python-Orchestrator (agy) vorbei
  weiterverfügbar bleiben.

## Non-Goals

- HTTP-Transport, Cluster-Deployment, Harnesses über `claude_code` und `opencode` hinaus (agy,
  qwen_code und llamacpp bleiben tresorfrei), dediziertes Service-Konto, Änderungen an
  Vaultwarden selbst.

## Decisions

### D1 — stdio lokal statt HTTP im devmesh
warden-mcp hat keine eigene Authentifizierung (README: "No built-in authentication"); ein HTTP-
Dienst bräuchte den Shared Guard davor und hielte das Master-Passwort dauerhaft im Cluster. stdio
startet den Prozess nur für die Session, ohne offenen Port. Verworfen: Ansatz B (devmesh) und C
(nur `claude mcp add-json` im User-Scope — umgeht die Registry-SSOT und `task mcp:check`).

### D2 — Launcher + `server.env` statt `${VAR}` in `.mcp.json`
`scripts/mcp-sync.sh` schreibt `env` von stdio-Servern wörtlich in die getrackte `.mcp.json`.
Qwen liest `.mcp.json` vorrangig und expandiert `${VAR}` nicht (T004272). Deshalb liest ein
Launcher `~/.config/warden-mcp/server.env` — dasselbe Muster wie `bge-mcp`, `mcp-postgres`,
`factory-mcp-node` (Rechte: chmod 600 bzw. icacls nur eigener Benutzer, vgl.
`harden_secret_file` in `scripts/mcp-sync.sh`). `os.homedir()` löst auf dem Windows-Desktop-Host
auf `%USERPROFILE%` auf, in WSL auf `$HOME`.

### D3 — Persönliches Konto, Vollzugriff, `ask`-Gate
Nutzer-Entscheidung: persönliches Vaultwarden-Konto, `READONLY`/`NOREVEAL` aus. Blast-Radius wird
über `permissions.ask` für alle 25 mutierenden Tools begrenzt. Die Liste stammt aus
`dist/tools/registerTools.js` von `@icoretech/warden-mcp@0.2.44` (alle `registerTool`-Aufrufe mit
`mutatingToolAnnotations` oder `destructiveToolAnnotations`). Claude-Code-Toolname:
`mcp__warden__keychain_<name>` (Default `TOOL_PREFIX=keychain`, Separator `_`).

### D4 — Version pinnen
`@icoretech/warden-mcp@0.2.44` statt `@latest`: jedes Upgrade kann neue mutierende Tools bringen,
die sonst ohne `ask`-Regel durchrutschen. Ein Upgrade ist ein eigener Change, der die Liste neu
zieht.

### D5 — Windows: native bw.exe 2026.6.x (Befund Smoke-Test, 2026-09-26)
warden-mcp spawnt `bw` ohne Shell; das gebündelte `@bitwarden/cli` ist unter Windows eine
`.js`-Datei → `spawn EFTYPE`. Der Launcher setzt deshalb `BW_BIN` auf eine echte `bw.exe`
(PATH, sonst `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Bitwarden.CLI_*`). bw ≥ 2026.7.0 kann
Einträge von Vaultwarden 1.36.0 nicht entschlüsseln (`invalid type: JsValue(Object …)`), getestet
2026.5.0/2026.6.0 ok, 2026.7.0/2026.8.0/2026.9.0 kaputt → `winget install Bitwarden.CLI --version
2026.6.0` + `winget pin add --id Bitwarden.CLI --version 2026.6.*`. Außerdem setzt der Launcher
`KEYCHAIN_BW_HOME_ROOT` (sonst `/data/bw-profiles`, weil `HOME` unter Windows leer ist) und
startet npx über `npx-cli.js` mit `cwd = Home` (cmd.exe verweigert UNC-Arbeitsverzeichnisse).
`SSO_ONLY=true` blockiert den API-Key-Login nicht (`bw login --apikey` + `unlock` erfolgreich).

### D6 — WSL/Linux: dieselbe Pin-Logik, `~/.local/bin/bw` [T900404, 2026-09-26]
Unter WSL ist das gebündelte `@bitwarden/cli` (2026.9.0) **startbar** — der `spawn EFTYPE`-Befund
aus D5 ist Windows-spezifisch —, scheitert aber beim Entschlüsseln genau wie bw ≥ 2026.7:
`bw.js --nointeraction --session <redacted> create item <redacted> failed with exit code 1`. Der
Launcher sucht darum plattformunabhängig `PATH` → `~/.local/bin/bw` → (nur Windows) WinGet-Paket und
prüft die Version. Fehlt ein nutzbares `bw`, ist das eine Warnung und kein Abbruch: warden-mcp
verbindet lazy und meldet `Vault access not ready yet <host>`. Für WSL wurde daher
bw-linux-2026.6.0 aus dem clients-Release `cli-v2026.6.0` nach `~/.local/bin/bw` installiert
(`chmod 700`) — dieselbe Version wie der Windows-Pin aus D5.

### D7 — Zweiter Harness `opencode` mit eigener ask-Liste [T900404, 2026-09-26]
Umgesetzt über die Registry (`harness.opencode` mit `type: local`,
`command: [node, scripts/warden-mcp/launch.mjs]`, `enabled: true`), damit `task mcp:check` die
Erreichbarkeit weiter fail-closed prüft. Der `mcp`-Block von `.opencode/opencode.jsonc` ist
generiert (nur dieser), der `permission`-Block nicht — die 25 Regeln stehen dort handgeschrieben
neben `"doom_loop": "deny"`. opencode bildet Tool-IDs als `<server>_<tool>`, also
`warden_keychain_<name>` ohne `mcp__`-Präfix. Wildcards (`"warden_*": "ask"`) wären kürzer,
explizit sind die 25 aber 1:1 mit `.claude/settings.json` und dem Release-Review vergleichbar —
die Liste wird bei jedem Versions-Bump an beiden Stellen neu gezogen.

## Risks

- **SSO_ONLY:** Vaultwarden läuft mit `SSO_ONLY=true` (Spec `vaultwarden-integration`). Ob der
  API-Key-Login (`client_credentials`) der `bw`-CLI zugelassen ist, ist ungeprüft → Smoke-Test als
  erster Umsetzungsschritt; bei Ablehnung Stopp, keine eigenmächtige Vaultwarden-Änderung.
- **Node-Version:** Windows-Host hat Node 26, das Paket deklariert `node ~22.23.3` (nur Warnung,
  kein `engine-strict`). Scheitert der Start, Fallback per Launcher-Option auf das Docker-Image
  `ghcr.io/icoretech/warden-mcp` ist ein eigener Folge-Change.
- **npx auf Windows:** `npx` ist dort `npx.cmd`; Node ≥ 20 verlangt `shell: true` zum Spawnen von
  `.cmd`-Dateien (CVE-2024-27980).
- **Dateirechte unter WSL:** `~/.config/warden-mcp/server.env` ist dort ein Symlink auf die
  Windows-Datei unter `/mnt/c`, wo `chmod 600` nicht greift (drvfs, Rechte 777). Der Launcher
  warnt in dem Fall nur — der Wert selbst ist der API-Key, nicht das Master-Passwort im Klartext
  der Prozessliste.
- **Master-Passwort auf Platte:** inhärent in warden-mcp (`BW_PASSWORD`); gemildert durch
  Dateirechte und Platzierung außerhalb jedes Repos.
