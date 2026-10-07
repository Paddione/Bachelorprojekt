---
title: "p1 — Installation: Taskfile und systemd-Unit"
ticket_id: T900538
domains: [agent-tooling, llm-local-dev]
status: active
---

# p1 — Installation

Files: `taskfiles/Taskfile.openclaw.yml` (komplett ersetzt), `openclaw/openclaw-gateway.service` (neu); disjunkt zu p2–p5.

Vertrag: `openspec/changes/openclaw-ops-bot/design.md`, Abschnitte „Gemeinsamer Vertrag" und „1. Installation".
Beide Dateien werden exakt mit den Inhalten unten geschrieben. Nichts anderes ändern, insbesondere
nicht `Taskfile.yml` (der Include `openclaw:` bleibt) und nichts unter `openclaw/` außer der Unit.
Die echte Installation (`task openclaw:install`) läuft in diesem Partial nicht, sie lädt aus dem Netz.

Regeln für beide Dateien:

- Im Taskfile verboten sind `sudo`, `npm install -g opencode`, `npm uninstall -g opencode`, `command -v opencode`
  und `.config/opencode`, auch in Kommentaren (Spec `llm-local-dev`). Erlaubt ist das Lesen von
  `~/.local/share/opencode/auth.json` mit `jq -r '."opencode-go".key // empty'`.
- `{{.VAR}}` ist ein Go-Template von Task und wird vor der Shell ersetzt. `$VAR` ist Shell. Im Taskfile
  darf nirgends sonst `{{` stehen.
- `configure` und `start` lesen `openclaw/.env.example`, `openclaw/openclaw.json5`, `openclaw/exec-approvals.json5`,
  `openclaw/workspace/AGENTS.md` und `openclaw/heartbeat-scratch.md` nur. Diese Dateien entstehen in p2 und p3.
  Ein `HEARTBEAT.md` im Workspace gibt es nicht (in OpenClaw ausgemustert, `doctor --fix` würde es archivieren).
  `.env.example` hat das Format `NAME=wert` je Zeile, Secrets mit leerem Wert.

## Task 1.1: systemd-User-Unit anlegen

Datei `openclaw/openclaw-gateway.service` mit exakt diesem Inhalt anlegen:

```ini
[Unit]
Description=OpenClaw Gateway (openclaw-ops-bot, T900538)

[Service]
Type=simple
EnvironmentFile=%h/.openclaw/.env
Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=%h/.local/bin/openclaw gateway --port 18789
Restart=always
RestartSec=5
RestartPreventExitStatus=78

[Install]
WantedBy=default.target
```

`ExecStart` nutzt den Wrapper `%h/.local/bin/openclaw`, den `install` schreibt. `Environment=PATH` macht
`kubectl`, `flux`, `gh` und `git` für die Exec-Allowlist auffindbar, ohne `~/.local/bin` vorauszusetzen.
Kein `After=network-online.target`, weil der User-Manager dieses Target nicht kennt.

Prüfung (kein `systemd-analyze verify`, das scheitert ohne installierten Wrapper):

```bash
f=openclaw/openclaw-gateway.service
for l in 'EnvironmentFile=%h/.openclaw/.env' 'ExecStart=%h/.local/bin/openclaw gateway --port 18789' \
         'Restart=always' 'RestartSec=5' 'RestartPreventExitStatus=78' 'WantedBy=default.target'; do
  grep -qxF "$l" "$f" || { echo "fehlt: $l"; exit 1; }
done
echo "unit ok"
```

## Task 1.2: Taskfile ersetzen

`taskfiles/Taskfile.openclaw.yml` vollständig durch diesen Inhalt ersetzen. Die alten Variablen
`DETECTED_CMD`, `OPCODE_CMD`, `OPENCLAW_HOME`, `OPENCODE_HOME`, `ACTIVE_HOME`, `BACKUP_DIR` und der
Schlusskommentar zu `factory-mcp` entfallen.

```yaml
version: "3"

# OpenClaw-Ops-Bot (T900538): eigener Node 24, OpenClaw per npm-Prefix, systemd-User-Unit.
# Vertrag: openspec/changes/openclaw-ops-bot/design.md. System-Node bleibt unverändert.

vars:
  OPENCLAW_VERSION: "2026.9.6"
  NODE24_VERSION: "v24.21.0"
  NODE24_SHA256: "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
  NODE24_TARBALL: "node-{{.NODE24_VERSION}}-linux-x64.tar.xz"
  NODE24_URL: "https://nodejs.org/dist/{{.NODE24_VERSION}}/{{.NODE24_TARBALL}}"
  GATEWAY_PORT: "18789"
  UNIT_NAME: openclaw-gateway.service
  UNIT_SRC: openclaw/openclaw-gateway.service
  ENV_TEMPLATE: openclaw/.env.example
  CONFIG_TEMPLATE: openclaw/openclaw.json5
  WORKSPACE_SRC: openclaw/workspace
  APPROVALS_TEMPLATE: openclaw/exec-approvals.json5
  SCRATCH_TEMPLATE: openclaw/heartbeat-scratch.md
  # Auth-Datei des Fallback-Providers, nur gelesen (Schlüssel "opencode-go").
  GO_AUTH_FILE:
    sh: 'printf "%s/opencode/auth.json" "${XDG_DATA_HOME:-$HOME/.local/share}"'

tasks:
  backup:
    desc: "~/.openclaw nach ~/.openclaw.bak.<YYYYMMDD> verschieben (Abbruch, wenn das Ziel existiert)"
    cmds:
      - |
        set -euo pipefail
        src="$HOME/.openclaw"
        dst="$HOME/.openclaw.bak.$(date +%Y%m%d)"
        if [[ ! -d "$src" ]]; then
          echo "Kein $src vorhanden, nichts zu sichern."
          exit 0
        fi
        if [[ -e "$dst" ]]; then
          echo "Backup $dst existiert bereits, Abbruch." >&2
          exit 1
        fi
        mv "$src" "$dst"
        echo "Verschoben: $src -> $dst"

  install:
    desc: "Node {{.NODE24_VERSION}} (SHA-256-geprüft) und OpenClaw {{.OPENCLAW_VERSION}} unter ~/.local/opt installieren"
    cmds:
      - |
        set -euo pipefail
        node_dir="$HOME/.local/opt/node24"
        prefix="$HOME/.local/opt/openclaw"
        wrapper="$HOME/.local/bin/openclaw"
        if [[ -x "$node_dir/bin/node" && "$("$node_dir/bin/node" --version)" == "{{.NODE24_VERSION}}" ]]; then
          echo "Node {{.NODE24_VERSION}} liegt bereits in $node_dir."
        else
          tmp="$(mktemp -d "${TMPDIR:-/tmp}/node24.XXXXXX")"
          trap 'rm -rf "$tmp"' EXIT
          curl -fsSL -o "$tmp/{{.NODE24_TARBALL}}" "{{.NODE24_URL}}"
          echo "{{.NODE24_SHA256}}  $tmp/{{.NODE24_TARBALL}}" | sha256sum -c -
          rm -rf "$node_dir"
          mkdir -p "$node_dir"
          tar -xJf "$tmp/{{.NODE24_TARBALL}}" -C "$node_dir" --strip-components=1
        fi
        export PATH="$node_dir/bin:$PATH"
        "$node_dir/bin/npm" install -g --prefix "$prefix" "openclaw@{{.OPENCLAW_VERSION}}"
        pkg="$prefix/lib/node_modules/openclaw/package.json"
        bin_rel="$("$node_dir/bin/node" -e '
          const b = require(process.argv[1]).bin;
          const r = typeof b === "string" ? b : (b && b.openclaw);
          if (!r) { console.error("package.json ohne bin.openclaw"); process.exit(1); }
          process.stdout.write(r);
        ' "$pkg")"
        bin_rel="${bin_rel#./}"
        mkdir -p "$(dirname "$wrapper")"
        printf '#!/usr/bin/env bash\nexec "$HOME/.local/opt/node24/bin/node" "$HOME/.local/opt/openclaw/lib/node_modules/openclaw/%s" "$@"\n' "$bin_rel" > "$wrapper"
        chmod 755 "$wrapper"
        ver="$("$wrapper" --version)"
        if [[ "$ver" != *"{{.OPENCLAW_VERSION}}"* ]]; then
          echo "Falsche Version: '$ver', erwartet {{.OPENCLAW_VERSION}}." >&2
          exit 1
        fi
        echo "OpenClaw $ver installiert, Wrapper: $wrapper"

  configure:
    desc: "~/.openclaw/.env, openclaw.json, Exec-Approvals, Workspace-Symlink AGENTS.md und systemd-Unit einrichten"
    cmds:
      - |
        set -euo pipefail
        repo="$(git rev-parse --show-toplevel)"
        state="$HOME/.openclaw"
        env_file="$state/.env"
        wrapper="$HOME/.local/bin/openclaw"
        if [[ ! -x "$wrapper" ]]; then
          echo "Wrapper $wrapper fehlt, zuerst task openclaw:install ausführen." >&2
          exit 1
        fi
        for f in "{{.ENV_TEMPLATE}}" "{{.CONFIG_TEMPLATE}}" "{{.APPROVALS_TEMPLATE}}" "{{.UNIT_SRC}}" "{{.WORKSPACE_SRC}}/AGENTS.md"; do
          if [[ ! -f "$repo/$f" ]]; then
            echo "Vorlage fehlt: $repo/$f" >&2
            exit 1
          fi
        done
        mkdir -p "$state/workspace"
        chmod 700 "$state"
        if [[ ! -f "$env_file" ]]; then
          cp "$repo/{{.ENV_TEMPLATE}}" "$env_file"
          echo "Angelegt: $env_file (aus {{.ENV_TEMPLATE}})"
        fi
        chmod 600 "$env_file"
        set_if_empty() {
          name="$1"
          value="$2"
          if grep -qE "^${name}=.+" "$env_file"; then
            return 0
          fi
          if [[ -z "$value" ]]; then
            echo "$name bleibt leer, bitte in $env_file eintragen."
            return 0
          fi
          if grep -qE "^${name}=" "$env_file"; then
            tmpf="$(mktemp)"
            awk -v n="$name" -v v="$value" 'index($0, n "=") == 1 { print n "=" v; next } { print }' "$env_file" > "$tmpf"
            cat "$tmpf" > "$env_file"
            rm -f "$tmpf"
          else
            printf '%s=%s\n' "$name" "$value" >> "$env_file"
          fi
          echo "$name gesetzt."
        }
        go_key=""
        if [[ -f "{{.GO_AUTH_FILE}}" ]]; then
          go_key="$(jq -r '."opencode-go".key // empty' "{{.GO_AUTH_FILE}}")"
        fi
        set_if_empty OPENCLAW_GATEWAY_TOKEN "$(openssl rand -hex 32)"
        set_if_empty TELEGRAM_BOT_TOKEN ""
        set_if_empty TELEGRAM_CHAT_ID ""
        set_if_empty OPENCLAW_LOCAL_BASE_URL "http://127.0.0.1:1919/v1"
        set_if_empty OPENCODE_GO_API_KEY "$go_key"
        set_if_empty OPENCLAW_GO_SESSION "$(cat /proc/sys/kernel/random/uuid)"
        set_if_empty OPENCLAW_LOG_LEVEL "info"
        cp "$repo/{{.CONFIG_TEMPLATE}}" "$state/openclaw.json"
        echo "Kopiert: {{.CONFIG_TEMPLATE}} -> $state/openclaw.json"
        "$wrapper" approvals set --file "$repo/{{.APPROVALS_TEMPLATE}}"
        echo "Exec-Approvals eingespielt aus {{.APPROVALS_TEMPLATE}}"
        ln -sfn "$repo/{{.WORKSPACE_SRC}}/AGENTS.md" "$state/workspace/AGENTS.md"
        unit_dir="$HOME/.config/systemd/user"
        mkdir -p "$unit_dir"
        cp "$repo/{{.UNIT_SRC}}" "$unit_dir/{{.UNIT_NAME}}"
        systemctl --user daemon-reload
        echo "Unit installiert: $unit_dir/{{.UNIT_NAME}}"

  start:
    desc: "Gateway-Unit starten, Heartbeat-Scratch des Agenten ops einspielen, danach Status"
    cmds:
      - systemctl --user enable --now {{.UNIT_NAME}}
      - |
        set -euo pipefail
        repo="$(git rev-parse --show-toplevel)"
        wrapper="$HOME/.local/bin/openclaw"
        scratch="$repo/{{.SCRATCH_TEMPLATE}}"
        url="http://127.0.0.1:{{.GATEWAY_PORT}}/healthz"
        ready=0
        for i in $(seq 1 30); do
          if curl -fsS --max-time 1 -o /dev/null "$url"; then
            ready=1
            break
          fi
          sleep 1
        done
        if [[ "$ready" != "1" ]]; then
          echo "Warnung: Gateway nach 30 s nicht bereit ($url), Heartbeat-Scratch nicht eingespielt."
          exit 0
        fi
        if [[ ! -f "$scratch" ]]; then
          echo "Warnung: $scratch fehlt, Heartbeat-Scratch nicht eingespielt."
          exit 0
        fi
        jobs_json="$("$wrapper" cron list --all --json)" || {
          echo "Warnung: openclaw cron list --all --json schlug fehl, Heartbeat-Scratch nicht eingespielt."
          exit 0
        }
        job_id="$(printf '%s' "$jobs_json" | jq -r '
          (if type == "array" then . else (.jobs // .items // []) end)
          | .[]
          | select((.name // "") == "Heartbeat (ops)" or ((.agentId // "") == "ops" and ((.name // "") | startswith("Heartbeat"))))
          | .id' | head -n 1 || true)"
        if [[ -z "$job_id" ]]; then
          echo "Warnung: kein Heartbeat-Job für Agent ops gefunden, Heartbeat-Scratch nicht eingespielt."
          exit 0
        fi
        "$wrapper" cron scratch "$job_id" --file "$scratch"
        echo "Heartbeat-Scratch aus {{.SCRATCH_TEMPLATE}} in Job $job_id eingespielt."
      - task: status

  status:
    desc: "Unit-Zustand, Gateway-/healthz, lokales Modell und Telegram-Variablen"
    cmds:
      - |
        set -uo pipefail
        rc=0
        if systemctl --user is-active --quiet {{.UNIT_NAME}}; then
          echo "unit: active"
        else
          echo "unit: inactive"
          rc=1
        fi
        if curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:{{.GATEWAY_PORT}}/healthz"; then
          echo "gateway: ok (http://127.0.0.1:{{.GATEWAY_PORT}}/healthz)"
        else
          echo "gateway: keine Antwort auf http://127.0.0.1:{{.GATEWAY_PORT}}/healthz"
          rc=1
        fi
        base="${OPENCLAW_LOCAL_BASE_URL:-}"
        if [[ -z "$base" && -f "$HOME/.openclaw/.env" ]]; then
          base="$(grep -E '^OPENCLAW_LOCAL_BASE_URL=' "$HOME/.openclaw/.env" | tail -n 1 | cut -d= -f2-)"
        fi
        base="${base:-http://127.0.0.1:1919/v1}"
        if curl -fsS --max-time 3 -o /dev/null "$base/models"; then
          echo "lokales Modell: ok ($base/models)"
        else
          echo "lokales Modell: nicht erreichbar ($base/models), Heartbeats laufen über den Fallback"
        fi
        for name in TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID; do
          if ! grep -qE "^${name}=.+" "$HOME/.openclaw/.env" 2>/dev/null; then
            echo "Hinweis: $name ist in $HOME/.openclaw/.env leer, Telegram-Zustellung fehlt."
          fi
        done
        exit "$rc"

  logs:
    desc: "Letzte 100 Journal-Zeilen der Gateway-Unit"
    cmds:
      - journalctl --user -u {{.UNIT_NAME}} -n 100 --no-pager

  restore:
    desc: "Unit stoppen, OpenClaw-Prefix und ~/.openclaw entfernen, neuestes Backup zurückholen (Node 24 bleibt)"
    cmds:
      - |
        set -euo pipefail
        systemctl --user disable --now {{.UNIT_NAME}} 2>/dev/null || true
        rm -rf "$HOME/.local/opt/openclaw" "$HOME/.local/bin/openclaw" "$HOME/.openclaw"
        latest="$(ls -1d "$HOME"/.openclaw.bak.* 2>/dev/null | sort | tail -n 1 || true)"
        if [[ -n "$latest" ]]; then
          mv "$latest" "$HOME/.openclaw"
          echo "Zurückgeholt: $latest -> $HOME/.openclaw"
        else
          echo "Kein Backup gefunden, OpenClaw ist entfernt."
        fi

  wipe:
    desc: "Destruktiv: Unit, Prefix, Node 24, ~/.openclaw und alle Backups entfernen. Erfordert CONFIRM=yes"
    cmds:
      - |
        set -euo pipefail
        if [[ "{{.CONFIRM}}" != "yes" ]]; then
          echo "Abbruch: task openclaw:wipe CONFIRM=yes entfernt Unit, Prefix, Node 24, ~/.openclaw und alle Backups." >&2
          exit 1
        fi
        systemctl --user disable --now {{.UNIT_NAME}} 2>/dev/null || true
        rm -f "$HOME/.config/systemd/user/{{.UNIT_NAME}}"
        systemctl --user daemon-reload 2>/dev/null || true
        rm -rf "$HOME/.local/opt/openclaw" "$HOME/.local/bin/openclaw" "$HOME/.local/opt/node24" "$HOME/.openclaw"
        rm -rf "$HOME"/.openclaw.bak.*
        echo "Entfernt."
```

Semantik je Task (Design, Abschnitt 1):

- `install`: Node-Tarball nach `$TMPDIR` laden, `sha256sum -c` bricht vor dem Entpacken ab, Entpacken nach
  `~/.local/opt/node24`; `npm install -g --prefix ~/.local/opt/openclaw openclaw@2026.9.6` mit dem Node-24-`npm`.
  Den Bin-Pfad liest Node aus `package.json` (`bin` als String oder als Objekt mit Schlüssel `openclaw`,
  führendes `./` wird entfernt). Der Wrapper enthält `$HOME` wörtlich. Abschluss: `openclaw --version`
  muss `2026.9.6` enthalten.
- `configure`: bricht ab, wenn der Wrapper oder eine Vorlage fehlt. Legt `.env` nur an, wenn sie fehlt (chmod 600), füllt
  nur leere Werte: Token per `openssl rand -hex 32`, Session per `/proc/sys/kernel/random/uuid`, Go-Key per
  `jq` aus der Auth-Datei. Bestehende Werte bleiben. `TELEGRAM_BOT_TOKEN` und `TELEGRAM_CHAT_ID` bleiben leer (trägt der
  Nutzer ein). Kopiert die Config, spielt danach die Exec-Allowlist per
  `openclaw approvals set --file openclaw/exec-approvals.json5` ein, setzt den Symlink `~/.openclaw/workspace/AGENTS.md`, installiert
  die Unit und ruft `daemon-reload`.
- Syntax-Beleg für `approvals set`: context7 `/websites/openclaw_ai`, Seite `https://docs.openclaw.ai/cli/approvals.md`
  („Set approvals from file or stdin": `openclaw approvals set --file ./exec-approvals.json`, JSON5 erlaubt).
  Ohne `--gateway`/`--node` gilt das lokale Host-Dokument. Die Doku-Version ist nicht an `2026.9.6` gebunden,
  deshalb nach der echten Installation einmal `openclaw approvals --help` gegenprüfen (Design R6).
- `status`: Exit 1, wenn Unit oder Gateway nicht antworten. Ein nicht erreichbares lokales Modell ist nur ein
  Hinweis (Fallback, R7). Leere `TELEGRAM_BOT_TOKEN` oder `TELEGRAM_CHAT_ID` ergeben je eine Hinweiszeile.
- `start`: Unit aktivieren, bis zu 30 s `/healthz` pollen, dann die Job-ID des Heartbeat-Jobs von `ops` aus
  `openclaw cron list --all --json` lesen und `openclaw cron scratch <jobId> --file openclaw/heartbeat-scratch.md`
  ausführen, danach `status`. Gateway nicht bereit, Scratch-Datei fehlt, `cron list` scheitert oder kein Job
  gefunden: je eine Zeile `Warnung: ...`, kein Abbruch.
- Syntax-Beleg für `cron`: context7 `/websites/openclaw_ai`, `https://docs.openclaw.ai/gateway/heartbeat.md`
  („Manage heartbeat scratch": `openclaw cron scratch <jobId> --file notes.md`; der Gateway führt je Agent mit
  Heartbeat einen System-Job, sichtbar in `openclaw cron list --all` als `Heartbeat (agent-id)`) und
  `https://docs.openclaw.ai/cli/cron.md` („--json always requests JSON output"). Die Form der JSON-Liste ist
  dort nicht dokumentiert. Der `jq`-Filter akzeptiert deshalb ein Array oder ein Objekt mit `jobs`/`items`
  und wählt `name == "Heartbeat (ops)"` oder `agentId == "ops"` mit Namen ab `Heartbeat`. Nach der echten
  Installation einmal `openclaw cron list --all --json` gegenprüfen (Design R6).
- `restore` und `wipe` entfernen zusätzlich den Wrapper `~/.local/bin/openclaw`, damit kein toter Wrapper
  zurückbleibt.

Prüfung:

```bash
python3 -c '
import re, yaml
d = yaml.safe_load(open("taskfiles/Taskfile.openclaw.yml"))
v = d["vars"]
assert re.fullmatch(r"[0-9a-f]{64}", v["NODE24_SHA256"]), "NODE24_SHA256"
assert v["NODE24_SHA256"] == "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
assert v["OPENCLAW_VERSION"] == "2026.9.6" and v["NODE24_VERSION"] == "v24.21.0"
want = "backup install configure start status logs restore wipe".split()
assert sorted(d["tasks"]) == sorted(want), sorted(d["tasks"])
print("yaml ok")
'
! grep -nF -e sudo -e 'npm install -g opencode' -e 'npm uninstall -g opencode' -e 'command -v opencode' -e '.config/opencode' taskfiles/Taskfile.openclaw.yml
for t in backup install configure start status logs restore wipe; do
  grep -qE "^  ${t}:" taskfiles/Taskfile.openclaw.yml || { echo "fehlt: $t"; exit 1; }
done
task --list-all --taskfile taskfiles/Taskfile.openclaw.yml
```

## Task 1.3: Offline-Rauchtest mit Fake-HOME

Prüft `backup`, `restore` und die `wipe`-Sperre, ohne Netzwerk und ohne echte Installation. `systemctl` wird
durch einen Stub ersetzt, damit der echte User-Manager unberührt bleibt. Nichts davon wird ins Repo geschrieben.

```bash
set -u
tf="$PWD/taskfiles/Taskfile.openclaw.yml"
tmp="$(mktemp -d)"
mkdir -p "$tmp/home/.openclaw" "$tmp/stub"
printf '#!/bin/sh\nexit 3\n' > "$tmp/stub/systemctl"
chmod +x "$tmp/stub/systemctl"
run() { HOME="$tmp/home" PATH="$tmp/stub:$PATH" task --taskfile "$tf" "$@"; }
run backup && test -d "$tmp/home/.openclaw.bak.$(date +%Y%m%d)" && echo "backup ok"
mkdir "$tmp/home/.openclaw"
run backup && { echo "FEHLER: zweites backup hätte abbrechen müssen"; exit 1; }
run restore && test -d "$tmp/home/.openclaw" && ! ls -d "$tmp/home"/.openclaw.bak.* 2>/dev/null && echo "restore ok"
run wipe && { echo "FEHLER: wipe ohne CONFIRM=yes"; exit 1; }
test -d "$tmp/home/.openclaw" && echo "wipe-sperre ok"
run wipe CONFIRM=yes && ! test -e "$tmp/home/.openclaw" && echo "wipe ok"
rm -rf "$tmp"
```

Erwartet: die Zeilen `backup ok`, `restore ok`, `wipe-sperre ok`, `wipe ok` und kein `FEHLER`.

Akzeptanz: Die p5-Tests in `tests/unit/openclaw-taskfile.bats` (acht Tasks, keine verbotenen Muster,
`NODE24_SHA256` mit 64 Hex-Zeichen, Root-Include) laufen gegen diese Dateien.
