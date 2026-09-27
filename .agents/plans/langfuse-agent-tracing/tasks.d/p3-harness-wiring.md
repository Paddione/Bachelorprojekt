# p3 — Harness-Verdrahtung

Target files: `scripts/langfuse/client-env.sh`, `scripts/langfuse/setup-harnesses.sh`,
`taskfiles/Taskfile.devmesh.yml`.

Keine eingecheckte Harness-Config wird geändert (`.claude/settings.json`, `.opencode/opencode.jsonc`
bleiben unberührt): Tracing ist opt-in pro Maschine, Factory- und CI-Läufe tracen nicht mit.
Plugin-Versionen gepinnt (design.md D3). Vor dem Schreiben die vier Integrationsseiten frisch
abrufen (`https://langfuse.com/integrations/developer-tools/{claude-code,opencode,pi-agent,codex}.md`).

### Task 1: `scripts/langfuse/client-env.sh`

- `set -euo pipefail`, Kopfkommentar mit Zweck, Aufruf, Exit-Codes (0 ok, 1 Secret fehlt, 2 Vorbedingung).
- Liest mit `kubectl --context devmesh -n workspace get secret workspace-secrets` die Keys
  `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` / `_SECRET_KEY` (base64-dekodiert) und `DEVMESH_DOMAIN` via
  `source scripts/env-resolve.sh dev`.
- Schreibt `${XDG_CONFIG_HOME:-$HOME/.config}/langfuse/agent-tracing.env` mit `umask 077`:
  `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL=https://langfuse.${DEVMESH_DOMAIN}`.
- `--print-path` gibt nur den Dateipfad aus. Leere Keys → Exit 1 mit Hinweis auf `task env:seal ENV=dev`.
- Secrets nie auf stdout.

### Task 2: `scripts/langfuse/setup-harnesses.sh`

Liest `agent-tracing.env`, dann je Harness, übersprungen mit Meldung `skip <harness>: not installed`
wenn `command -v` leer:

| Harness | Aktion |
|---|---|
| claude | `claude plugin marketplace add langfuse/claude-observability-plugin`, `claude plugin install langfuse-observability@langfuse-observability`, Credentials per `--config LANGFUSE_PUBLIC_KEY=… --config LANGFUSE_SECRET_KEY=… --config LANGFUSE_BASE_URL=…` (README des Plugins). |
| opencode | Globales `~/.config/opencode/opencode.json`: `plugins` um `@langfuse/opencode-observability-plugin@0.5.1` ergänzen (per `jq`, idempotent), Credentials in `~/.config/opencode/opencode-langfuse.json` (`publicKey`, `secretKey`, `baseUrl`, `environment: "development"`). |
| pi | `pi install npm:@langfuse/pi-observability-plugin@0.1.2`, Credentials in `~/.pi/agent/langfuse.json`. |
| codex | `codex plugin marketplace add langfuse/codex-observability-plugin`, `codex plugin add tracing@codex-observability-plugin`, in `~/.codex/config.toml` `[features] hooks = true` und `[plugins."tracing@codex-observability-plugin"] enabled = true` setzen, falls fehlend; Credentials in `~/.codex/langfuse.json` (`enabled`, `public_key`, `secret_key`, `base_url`). |

Alle Credential-Dateien mit `umask 077`. `userId` in allen Configs = `git config user.email`.
Flags: `--dry-run` gibt pro Harness die geplante Aktion als Zeile `<harness>: <aktion>` aus und
ändert nichts (auch ohne `agent-tracing.env` lauffähig). Zweiter Lauf ohne `--dry-run` ist ein No-op.

### Task 3: Taskfile

In `taskfiles/Taskfile.devmesh.yml` Task `langfuse:setup`
(`desc: "devmesh: Langfuse-Credentials holen und Agent-Harnesses fuer Tracing verdrahten [T900688]"`),
cmds: `bash scripts/langfuse/client-env.sh` und `bash scripts/langfuse/setup-harnesses.sh`.
Precondition wie `deploy` (Context `devmesh` vorhanden). Macht beide Skripte S4-erreichbar.

```bash
task --list | grep 'devmesh:langfuse:setup'
bash scripts/langfuse/setup-harnesses.sh --dry-run
```
