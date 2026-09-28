# Harness-Konfigurationsziele — Messprotokoll (T900791)

Mess-Konvention T002717: `PRE=ddceb19ba6a22d311d15ad9097b86413f815b95e`
(gemessen 2026-09-28 im Worktree `harness-specialization`).
Suchmuster je Harness im eigenen Abschnitt als ausführbarer Befehl.

Fragestellung aus Spec-Risiko R4: Welche Konfigurationsdatei liest jede der fünf
Harnesses ohne P1-Adapter (codex, omp, muse, agy, openclaw) für MCP-Server, und
wirkt eine Projekt-Datei im Repo? Befund-Vokabular: `project` / `user` /
`flag-only` / `nicht messbar`. Regel: Nur Positiv-Befunde zählen; eine leere
Liste ist kein Nein, sondern „nicht messbar".

## codex — Befund: project (mit Verifikationsvorbehalt)

Version: `codex-cli 0.157.1`.

```bash
codex mcp list
```

Gekürzte Ausgabe (7 stdio-Server, 4 streamable_http, 2 disabled):

```text
Name                 Command  Args  Env  Cwd  Status    Auth
brain-mcp-node       node     …     …    …    disabled  Unsupported
codebase-memory-mcp  …        …     …    …    enabled   Unsupported
context7             npx      …     …    …    enabled   Unsupported
…
```

MCP-Quelle (User): `~/.codex/config.toml`, Tabelle `[mcp_servers.<name>]`.
Schalter pro Server: `enabled = false` (belegt: `brain-mcp-node`,
`factory-mcp-node` zeigen `disabled`). Zusätzlich Flag-Overrides
(`-c key=value`, z. B. `-c 'mcp_servers.x.enabled=false'`) und Profile
(`-p <name>` → `$CODEX_HOME/<name>.config.toml`).

Projekt-Probe (Temp-Git-Repo, danach gelöscht):

```bash
mkdir -p .codex
printf '[mcp_servers.probe-t900791]\ncommand = "echo"\nargs = ["probe-t900791"]\n' > .codex/config.toml
codex mcp list | grep -c 'probe-t900791'   # → 0 (Liste nicht leer: 11 Server)
codex doctor                               # → „MCP servers 11" (identisch ohne Projekt-Datei)
```

Negativ in beiden List-Sichtbarkeiten. Aber:

```bash
strace -f -e trace=%file -o trace.log codex mcp list
grep '\.codex/config\.toml' trace.log
# → open("/tmp/…/.codex/config.toml", O_RDONLY|…) = 10  (mehrfach, erfolgreich)
```

`codex mcp list` öffnet `.codex/config.toml` im cwd erfolgreich — die Datei wird
gelesen, ihr `[mcp_servers.*]`-Inhalt erscheint aber weder in `mcp list` noch in
`doctor`. Upstream-Doku (oh-my-pi `docs/mcp-config.md`, Abschnitt „Imported tool
configs") bestätigt `.codex/config.toml` als Codex-Projektpfad. Mögliche Ursachen
für die unsichtbare Liste: Trust-Gating oder List-Scope (nur User-Ebene); der
Laufzeit-Merge ist nur per API-Session verifizierbar.

Vorgeschlagen: `config: .codex/config.toml` (Kandidat, Laufzeit-Merge offen).

## omp — Befund: project (Doku-Befund, nicht installiert)

Quelle: Upstream-Repo `can1357/oh-my-pi`, Datei `docs/mcp-config.md`:

```bash
gh api "repos/can1357/oh-my-pi/contents/docs/mcp-config.md" --jq '.content' | base64 -d
```

Gekürzte Ausgabe:

```text
## Preferred config locations
- Project: `.omp/mcp.json`
- User: `~/.omp/agent/mcp.json` (oder `~/.omp/profiles/<name>/agent/mcp.json` …)
The native provider also reads `.omp/.mcp.json` and `~/.omp/agent/.mcp.json`
for compatibility, but OMP writes to the primary `mcp.json` paths above.
OMP also accepts fallback standalone files in the project root:
- `mcp.json`
- `.mcp.json`
```

Projekt-Scope (`.omp/mcp.json`) gilt profilübergreifend; ein projektweites
`enabled: false` unterdrückt gleichnamige User-Server. Schalter: `/mcp enable`,
`/mcp disable` sowie `enabled`-Feld in der Datei.

Vorgeschlagen: `config: .omp/mcp.json`.

## muse — Befund: user

Version: `Muse Code 1.4.0 (1.4.0-R4302.1)`.

```bash
muse mcp --help
# → nur OAuth-Login/Logout: „<server> is a streamable-HTTP entry under
#   mcpServers in settings.json." Kein `mcp list`-Äquivalent.
```

MCP-Quelle (User): `~/.config/muse/settings.json`, Key `mcpServers`
(gemessen: 2 Server, Einträge mit `command`/`args`/`env`). Kein `enabled`-Feld
in der Stichprobe beobachtet; kein dokumentierter Projekt-Pfad in `muse --help`.

Projekt-Probe per strace (Offline-Anbieter `echo`, kein API-Verbrauch):

```bash
muse exec --provider echo --no-session-log "reply with the word READY"
# Dateien unter dem Temp-Git-Repo, die muse öffnet/sucht (vollständig):
# .muse/hooks.json, AGENTS.md, CLAUDE.md, .agents/…, .claude/…, .codex/…,
# .env, .npmrc, package.json, node_modules/… — KEIN .muse/settings.json,
# KEIN .mcp.json, KEIN muse.json. MCP kommt aus ~/.config/muse/settings.json.
```

`.muse/` im Projekt trägt nur Hooks, keine Server-Definitionen.

Vorgeschlagen: `config: null` (kein Projekt-Ziel; ein künftiger User-Scope-Adapter
könnte `~/.config/muse/settings.json` verwalten, außerhalb P1).

## agy — Befund: user

Version: `1.2.12`.

```bash
agy mcp list
```

Gekürzte Ausgabe (7 Server):

```text
NAME                 TYPE   STATUS   COMMAND/URL
bge-mcp              http   enabled  http://localhost:13005/mcp
codebase-memory-mcp  stdio  enabled  npx -y codebase-memory-mcp@0.10.8
…
```

MCP-Quelle (User): `~/.gemini/config/mcp_config.json`, Key `mcpServers`.
Schalter: `agy mcp enable <name>` / `agy mcp disable <name>`. Das Repo-`.agy/`
enthält nur `hooks.json` + Hooks, keine MCP-Konfiguration.

Projekt-Probe (Temp-Git-Repo, danach gelöscht):

```bash
printf '{"mcpServers":{"probe-t900791":{"command":"echo","args":["probe"]}}}' > .agy/mcp_config.json
printf '{"mcpServers":{"probe-t900791":{"command":"echo","args":["probe"]}}}' > .agy/settings.json
printf '{"mcpServers":{"probe-t900791":{"command":"echo","args":["probe"]}}}' > .gemini/settings.json
agy mcp list | grep -c 'probe-t900791'   # → 0 (Liste nicht leer: 7 Server)
```

Keiner der drei Kandidaten wirkt; `mcp add`/`mcp list` kennen keine Scope-Flags.

Vorgeschlagen: `config: null` (kein Projekt-Ziel; ein künftiger User-Scope-Adapter
könnte `~/.gemini/config/mcp_config.json` verwalten, außerhalb P1).

## openclaw — Befund: user (Doku-Befund, nicht installiert)

Quelle: Upstream-Repo `openclaw/openclaw`:

```bash
gh api "repos/openclaw/openclaw/contents/docs/tools/mcp.md" --jq '.content' | base64 -d
gh api "repos/openclaw/openclaw/contents/docs/gateway/configuration.md" --jq '.content' | base64 -d
```

Gekürzte Ausgabe:

```text
# Connect MCP servers
Server definitions live under `mcp.servers` in config …
# Gateway configuration
OpenClaw reads an optional JSON5 config from `~/.openclaw/openclaw.json`.
```

Einzige Konfigurationsdatei: `~/.openclaw/openclaw.json` (JSON5, Gateway-zentrisch;
Pfad per `OPENCLAW_CONFIG_PATH` umleitbar). Verwaltung per Control UI
(Settings → MCP, Zeilen mit enable/disable/remove), CLI (`openclaw mcp add`,
`openclaw mcp doctor <name> --probe`) oder Direkt-Edit mit Hot-Reload. Kein
projektbezogener Scope dokumentiert.

Vorgeschlagen: `config: null` (kein Projekt-Ziel; ein künftiger User-Scope-Adapter
könnte `~/.openclaw/openclaw.json` verwalten, außerhalb P1).

## Zusammenfassung

| Harness    | Befund  | Quelle heute                          | Vorgeschlagenes `config:` |
|------------|---------|---------------------------------------|---------------------------|
| codex      | project | `~/.codex/config.toml` + `.codex/config.toml` (gelesen, Merge offen) | `.codex/config.toml` |
| omp        | project | `.omp/mcp.json` (Doku)                | `.omp/mcp.json`           |
| muse       | user    | `~/.config/muse/settings.json`        | `null`                    |
| agy        | user    | `~/.gemini/config/mcp_config.json`    | `null`                    |
| openclaw   | user    | `~/.openclaw/openclaw.json` (Doku)    | `null`                    |

Konsequenz für die Registry: codex und omp sind Kandidaten für Projekt-Adapter
in P3/P4 bzw. Folgetickets; muse, agy und openclaw brauchen einen User-Scope,
den P1 bewusst nicht baut. Keine Konfigurationsdatei im Repo oder im Home wurde
dauerhaft verändert (Proben liefen in Temp-Repos, danach gelöscht).
