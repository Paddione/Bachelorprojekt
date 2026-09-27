---
title: "openclaw-ops-bot — Design"
ticket_id: T900538
status: draft
---

# openclaw-ops-bot — Design

## Entscheidungen (User, 2026-09-27)

| ID | Frage | Entscheidung |
|----|-------|--------------|
| D1 | Node 24 | Gepinnter Tarball `node-v24.21.0-linux-x64.tar.xz`, SHA-256 geprüft, eigenes Verzeichnis. |
| D2 | Modell | Primär lokal `:1919`, Fallback `opencode-go/muse-spark-1.3-contributor`, Reasoning `low`. Zen-free ist außerhalb von OpenCode gesperrt (`FreeTierError`). |
| D3 | Alerts | Pull per Heartbeat, 30 min, Telegram nur bei Befund. Gateway nur Loopback. |
| D4 | Broker | Synchron über `/v1/chat/completions`, Agent `task-runner`. |
| D5 | Autonomie | Nur empfehlen. Exec ausschließlich über Allowlist mit Read-only-Befehlen. |

## Gemeinsamer Vertrag (bindend für alle Partials)

| Name | Wert |
|------|------|
| OpenClaw-Version | `2026.9.6` (Taskfile-Var `OPENCLAW_VERSION`) |
| Node-Version | `v24.21.0` (Taskfile-Var `NODE24_VERSION`) |
| Node-SHA-256 | `fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6` für `node-v24.21.0-linux-x64.tar.xz` |
| Node-Verzeichnis | `$HOME/.local/opt/node24` (enthält `bin/node`, `bin/npm`) |
| OpenClaw-Prefix | `$HOME/.local/opt/openclaw` (npm `--prefix`) |
| Wrapper | `$HOME/.local/bin/openclaw` → `exec "$HOME/.local/opt/node24/bin/node" "$HOME/.local/opt/openclaw/lib/node_modules/openclaw/<bin-pfad>" "$@"`; den `<bin-pfad>` liest `install` zur Laufzeit aus `package.json` (`.bin.openclaw`) |
| State-Verzeichnis | `$HOME/.openclaw` (OpenClaw-Default) |
| Config-Ziel | `$HOME/.openclaw/openclaw.json` (JSON5), Vorlage `openclaw/openclaw.json5` im Repo |
| Secrets | `$HOME/.openclaw/.env`, chmod 600, Vorlage `openclaw/.env.example` |
| Workspace | `$HOME/.openclaw/workspace`, darin Symlinks `HEARTBEAT.md` und `AGENTS.md` auf `openclaw/workspace/` im Repo |
| systemd-Unit | `openclaw/openclaw-gateway.service` → installiert nach `$HOME/.config/systemd/user/openclaw-gateway.service` |
| Gateway | `bind: loopback`, Port `18789`, `auth.mode: token` mit `${OPENCLAW_GATEWAY_TOKEN}` |
| HTTP-API | `gateway.http.endpoints.chatCompletions.enabled: true` |
| Agenten | `ops` (default, Heartbeat) und `task-runner` (Broker) |
| Broker-Aufruf | `POST http://127.0.0.1:18789/v1/chat/completions`, `"model": "openclaw/task-runner"`, `Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN` |

### Umgebungsvariablen in `~/.openclaw/.env`

| Variable | Zweck | Quelle |
|----------|-------|--------|
| `OPENCLAW_GATEWAY_TOKEN` | Gateway-Bearer | `configure` erzeugt 64 Hex-Zeichen (`openssl rand -hex 32`), wenn leer |
| `TELEGRAM_BOT_TOKEN` | Telegram-Bot | Nutzer trägt ihn ein (@BotFather) |
| `OPENCLAW_LOCAL_BASE_URL` | lokales Modell | Default `http://127.0.0.1:1919/v1` |
| `OPENCODE_GO_API_KEY` | Fallback-Modell | `configure` liest `."opencode-go".key` aus `~/.local/share/opencode/auth.json`, wenn leer |
| `OPENCLAW_GO_SESSION` | stabiler `x-opencode-session` | `configure` erzeugt eine UUID, wenn leer |
| `OPENCLAW_LOG_LEVEL` | Log-Level | Default `info` |

## Komponenten

### 1. Installation (`taskfiles/Taskfile.openclaw.yml`, Umbau)

Die Task-Namen bleiben (Spec `llm-local-dev`): `backup`, `install`, `configure`, `start`,
`status`, `logs`, `restore`, `wipe`. Die opencode-Erkennung (`DETECTED_CMD`, `OPCODE_CMD`,
`ACTIVE_HOME`) entfällt vollständig. Kein `sudo`.

- `install`: Node-Tarball nach `$TMPDIR` laden, SHA-256 prüfen (Abbruch bei Abweichung), nach
  `~/.local/opt/node24` entpacken; `npm install -g --prefix ~/.local/opt/openclaw openclaw@<version>`
  mit dem Node-24-`npm`; Wrapper schreiben; `openclaw --version` muss `2026.9.6` enthalten.
- `configure`: `.env` aus `.env.example` anlegen, falls nicht vorhanden, und leere generierbare
  Werte füllen (siehe Tabelle). `openclaw/openclaw.json5` nach `~/.openclaw/openclaw.json`
  kopieren. Workspace-Symlinks setzen. Unit installieren und `daemon-reload`.
- `start`: `systemctl --user enable --now openclaw-gateway.service`, danach `status`.
- `status`: Unit aktiv? `GET http://127.0.0.1:18789/healthz`; Erreichbarkeit von
  `${OPENCLAW_LOCAL_BASE_URL}/models`.
- `logs`: `journalctl --user -u openclaw-gateway.service -n 100 --no-pager`.
- `backup`: `~/.openclaw` nach `~/.openclaw.bak.<YYYYMMDD>` verschieben; existiert das Ziel,
  Abbruch.
- `restore`: Unit stoppen und deaktivieren, `~/.local/opt/openclaw` und `~/.openclaw` entfernen,
  neuestes `~/.openclaw.bak.*` zurückverschieben. Node 24 bleibt.
- `wipe`: nur mit `CONFIRM=yes`; entfernt Unit, Prefix, Node 24, `~/.openclaw` und alle Backups.

Die Unit startet `%h/.local/opt/node24/bin/node <openclaw-bin> gateway --port 18789` mit
`EnvironmentFile=%h/.openclaw/.env`, `Restart=always`, `RestartSec=5`,
`RestartPreventExitStatus=78`, `WantedBy=default.target`. Den Pfad `<openclaw-bin>` setzt die Unit
über den Wrapper: `ExecStart=%h/.local/bin/openclaw gateway --port 18789`.

### 2. Config-Vorlage (`openclaw/openclaw.json5`)

- `update.checkOnStart: false`.
- `gateway`: siehe Vertrag.
- `models.mode: "merge"`, zwei Provider:
  - `local`: `baseUrl: "${OPENCLAW_LOCAL_BASE_URL}"`, `apiKey: "local-no-key"`,
    `api: "openai-completions"`, Modell `id: "local-default"`, `contextWindow: 131072`,
    `maxTokens: 8192`, `compat: { supportsTools: true, toolSchemaProfile: "llamacpp", thinkingFormat: "qwen-chat-template" }`.
  - `opencode-go`: `baseUrl: "https://opencode.ai/zen/go/v1"`, `apiKey: "${OPENCODE_GO_API_KEY}"`,
    `api: "openai-responses"`, Modell `id: "muse-spark-1.3-contributor"`, `reasoning: true`,
    `contextWindow: 1000000`, `maxTokens: 131072`, `compat: { supportedReasoningEfforts: ["low","medium","high"] }`.
    Die Header `x-opencode-session: ${OPENCLAW_GO_SESSION}` und ein eigener User-Agent sind R4
    und werden vom Nutzer ergänzt. Die Vorlage enthält dafür einen JSON5-Kommentar an dieser
    Stelle, keinen geratenen Schlüssel.
- `agents.defaults.model: { primary: "local/local-default", fallbacks: ["opencode-go/muse-spark-1.3-contributor"] }`,
  `agents.defaults.models["opencode-go/muse-spark-1.3-contributor"].params.thinking: "low"`.
- `agents.entries.ops`: `default: true`, `workspace: "~/.openclaw/workspace"`,
  `heartbeat: { every: "30m", target: "telegram" }`,
  `tools: { allow: ["read","exec","message"], deny: ["write","edit","apply_patch","browser","canvas"] }`.
- `agents.entries.task-runner`: selber Workspace, kein Heartbeat, dieselben `tools`.
- `tools.exec`: `mode: "allowlist"`, Allowlist-Muster `kubectl` (argPattern
  `^(--context \S+ )?(get|describe|logs|top) `), `flux` (`^get `), `gh` (`^(run|pr) (list|view) `),
  `git` (`^(status|log|diff) `), `task` (`^--list`), `bash` (`^scripts/(ticket\.sh (list|get)|vda\.sh oracle .* --dry-run)`).
- `channels.telegram: { enabled: true, dmPolicy: "pairing", groups: { "*": { requireMention: true } } }`,
  Token aus `TELEGRAM_BOT_TOKEN` (Umgebung, nicht in der Datei).
- Keine `mcp`-Sektion.

### 3. Workspace (`openclaw/workspace/`)

- `HEARTBEAT.md`: Checkliste. Jeder Punkt nennt den exakten Read-only-Befehl und die
  Befund-Bedingung:
  1. `flux get kustomizations --context fleet -A`, Befund bei `READY=False`, außer `korczewski`
     (per Design suspendiert).
  2. `kubectl --context fleet get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded`,
     Befund bei jeder Zeile.
  3. `gh run list --branch main --limit 5`, Befund bei `failure`.
  4. `bash scripts/ticket.sh list --status plan_staged`, Befund bei Einträgen älter als 24 h.
  
  Ohne Befund antwortet der Agent mit `HEARTBEAT_OK` (OpenClaw-Konvention, dann keine Zustellung).
  Mit Befund: pro Befund Symptom, vermutete Ursache, empfohlener Befehl. Nichts ausführen, was
  nicht auf der Allowlist steht.
- `AGENTS.md` (40–60 Zeilen): Rolle, Repo-Pfad `/home/patrick/Bachelorprojekt`, Read-only-Regel,
  Antwortformat für den Broker (erste Zeile `RESULT: done|recommend|refused`, danach Befehl und
  Ausgabe bzw. Empfehlung), Verbot, Secrets aus `environments/.secrets/` zu lesen.
- `docs/runbooks/openclaw-ops-bot.md`: Inbetriebnahme durch den Nutzer: Bot über @BotFather,
  Token in `~/.openclaw/.env`, `task openclaw:start`, `openclaw pairing approve telegram <code>`,
  Smoke-Test per `scripts/openclaw-ask.sh`, R4-Hinweis.

### 4. Broker (`scripts/openclaw-ask.sh`)

`scripts/openclaw-ask.sh [--agent <id>] [--timeout <s>] "<aufgabe>"`, Default-Agent `task-runner`,
Default-Timeout 300 s.

- Liest `OPENCLAW_GATEWAY_TOKEN` aus der Umgebung, sonst aus `~/.openclaw/.env`. Fehlt es: Exit 2.
- `OPENCLAW_GATEWAY_URL` überschreibt `http://127.0.0.1:18789`.
- Request per `curl` mit `jq -n` gebautem Body (`model: "openclaw/<agent>"`, `user: "conv:openclaw-ask-<pid>"`, eine User-Message).
- Gateway nicht erreichbar: Exit 3 mit Meldung, die die URL nennt.
- HTTP-Fehler oder fehlendes `.choices[0].message.content`: Exit 4 mit dem Fehlertext.
- Erfolg: gibt `.choices[0].message.content` auf stdout aus, Exit 0.

Registry: `capabilities.yaml` bekommt die Capability `ops-broker` mit `cli:openclaw-ask`
(`state: canonical`, `roles: [orchestrator]`, `tier: safe`, `use_when`, `avoid_when` „mutierende
Aktionen — OpenClaw empfiehlt nur", `deep_ref: "docs/runbooks/openclaw-ops-bot.md"`).

## Tests

- `tests/unit/openclaw-taskfile.bats` (Umbau): Taskfile parst; alle acht Tasks deklariert;
  kein `opencode` im Taskfile; `NODE24_SHA256` ist 64 Hex-Zeichen; `.env.example` enthält alle
  Variablen aus der Tabelle ohne Wert für Secrets; Root-Taskfile bindet ein; `.gitignore` enthält
  `openclaw/.env`.
- `tests/spec/openclaw-ops-bot.bats`: `openclaw.json5` parst mit Node (`json5` ist nicht
  installiert, deshalb Prüfung über `openclaw config validate`, falls vorhanden, sonst über
  einen Kommentar-Stripper im Test); `gateway.bind == "loopback"`; kein Literal-Token; Agenten
  `ops` und `task-runner` vorhanden; `deny` enthält `write` und `edit`; `openclaw-ask.sh` gegen
  einen Fake-Gateway (Node-HTTP-Stub in `tests/spec/fixtures/openclaw-fake-gateway.mjs`): Erfolg
  gibt Content aus, falsches Token → Exit 4, kein Lauscher → Exit 3, fehlendes Token → Exit 2.

## Risiken

- R4 (Nutzer): Provider-Header für OpenCode Go. Ohne sie antwortet Go mit `MissingSessionID`, der
  Fallback greift dann nicht.
- R5 (Nutzer): ein Session-Header pro Gateway statt pro Gespräch.
- R6: Die Allowlist-Syntax (`tools.exec`) ist gegen die installierte Version zu prüfen
  (`openclaw config validate`). Weicht sie ab, gilt die Doku der installierten Version, die
  Read-only-Semantik bleibt.
- R7: `:1919` ist Windows-seitig und nicht immer online. Dann läuft jeder Heartbeat über den
  Fallback.
