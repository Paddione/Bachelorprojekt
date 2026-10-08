# Runbook: OpenClaw-Ops-Bot

OpenClaw `2026.9.6` läuft als systemd-User-Dienst `openclaw-gateway.service` auf dem WSL-Host
(T900538). Es nutzt ein eigenes Node `v24.21.0` unter `~/.local/opt/node24`. Das System-Node
bleibt unverändert. Das Gateway lauscht nur auf `127.0.0.1:18789`.

- Agent `ops`: Heartbeat alle 30 Minuten nach der Checkliste `openclaw/heartbeat-scratch.md`,
  die als Monitor-Scratch des Heartbeat-Jobs eingespielt wird. Meldet nur Befunde per Telegram.
- Agent `task-runner`: Broker für andere Agenten, erreichbar über `scripts/openclaw-ask.sh`.
- Modellkette: primär lokal `:1919` (`OPENCLAW_LOCAL_BASE_URL`), Fallback
  `opencode-go/muse-spark-1.3-contributor` mit Reasoning `low`.
- Beide Agenten führen nur Read-only-Befehle aus und empfehlen Fixes, statt sie auszuführen.

## Dateien

| Pfad | Zweck |
|------|-------|
| `~/.openclaw/openclaw.json` | Config, kopiert aus `openclaw/openclaw.json5` |
| `~/.openclaw/.env` | Secrets, chmod 600, Vorlage `openclaw/.env.example` |
| `~/.openclaw/workspace/` | nur der Symlink `AGENTS.md` auf `openclaw/workspace/AGENTS.md` |
| `openclaw/heartbeat-scratch.md` (Repo) | Heartbeat-Checkliste, eingespielt von `task openclaw:start` |
| `openclaw/exec-approvals.json5` (Repo) | Exec-Allowlist, eingespielt von `task openclaw:configure` |
| `~/.config/systemd/user/openclaw-gateway.service` | Unit, Vorlage `openclaw/openclaw-gateway.service` |

## Inbetriebnahme

1. Vorhandenen Zustand sichern, falls `~/.openclaw` schon existiert:
   ```bash
   task openclaw:backup
   ```
2. Node 24 und OpenClaw installieren. Der Task prüft die SHA-256 des Node-Tarballs und bricht
   bei Abweichung ab:
   ```bash
   task openclaw:install
   openclaw --version    # muss 2026.9.6 enthalten
   ```
3. Config, Exec-Approvals, `.env`, Workspace-Symlink und Unit einrichten. Der Task erzeugt
   `OPENCLAW_GATEWAY_TOKEN` und `OPENCLAW_GO_SESSION` und übernimmt `OPENCODE_GO_API_KEY` aus
   `~/.local/share/opencode/auth.json`, wenn die Werte leer sind:
   ```bash
   task openclaw:configure
   ```
4. Telegram-Bot anlegen: In Telegram `@BotFather` öffnen, `/newbot` senden und den Anweisungen
   folgen. Den ausgegebenen Token in `~/.openclaw/.env` eintragen:
   ```bash
   TELEGRAM_BOT_TOKEN=<token von BotFather>
   ```
   Danach `chmod 600 ~/.openclaw/.env` prüfen (`ls -l ~/.openclaw/.env` zeigt `-rw-------`).
5. Gateway starten. Der Task startet die Unit und spielt danach
   `openclaw/heartbeat-scratch.md` als Monitor-Scratch des Heartbeat-Jobs von `ops` ein:
   ```bash
   task openclaw:start
   ```
   `task openclaw:status` muss eine aktive Unit, eine Antwort von
   `http://127.0.0.1:18789/healthz` und die Erreichbarkeit von `${OPENCLAW_LOCAL_BASE_URL}/models`
   melden.
6. Scratch prüfen. Die Job-ID des Heartbeat-Jobs zeigt `openclaw cron list`. Danach:
   ```bash
   openclaw cron scratch <jobId>
   ```
   Die Ausgabe muss die vier Prüfungen aus `openclaw/heartbeat-scratch.md` enthalten. Nach jeder
   Änderung an dieser Datei spielt `task openclaw:start` sie neu ein. Alternativ direkt:
   `openclaw cron scratch <jobId> --file openclaw/heartbeat-scratch.md`.
7. Telegram koppeln: dem Bot eine Direktnachricht schreiben. Er antwortet mit einem
   Pairing-Code. Offene Anfragen zeigt `openclaw pairing list telegram`. Freigeben:
   ```bash
   openclaw pairing approve telegram <code>
   ```
8. Heartbeat-Ziel setzen: die eigene Telegram-Chat-ID in `~/.openclaw/.env` eintragen und das
   Gateway neu starten:
   ```bash
   TELEGRAM_CHAT_ID=<deine chat-id>
   ```
   ```bash
   systemctl --user restart openclaw-gateway.service
   ```
9. Smoke-Test des Brokers:
   ```bash
   scripts/openclaw-ask.sh "Welche Pods laufen nicht?"
   ```
   Erwartet: Exit 0 und als erste Zeile `RESULT: done`, `RESULT: recommend` oder
   `RESULT: refused`.

## Broker für andere Agenten

```bash
scripts/openclaw-ask.sh [--agent <id>] [--timeout <s>] "<aufgabe>"
```

Default-Agent `task-runner`, Default-Timeout 300 s. Das Token kommt aus
`OPENCLAW_GATEWAY_TOKEN` oder aus `~/.openclaw/.env`. `OPENCLAW_GATEWAY_URL` ersetzt
`http://127.0.0.1:18789`.

| Exit | Bedeutung |
|------|-----------|
| 0 | Antwort des Agenten steht auf stdout |
| 2 | kein Gateway-Token gefunden |
| 3 | Gateway nicht erreichbar, die Meldung nennt die URL |
| 4 | HTTP-Fehler oder Antwort ohne `.choices[0].message.content` |

## Troubleshooting

- Dienststatus und Gateway-Logs:
  ```bash
  task openclaw:status
  task openclaw:logs    # journalctl --user -u openclaw-gateway.service -n 100 --no-pager
  ```
- Die Unit startet nicht neu und bleibt mit Exit-Status 78 stehen: Die Config ist ungültig.
  `openclaw config validate` zeigt den Fehler. Nach der Korrektur
  `systemctl --user restart openclaw-gateway.service`.
- Änderungen an `~/.openclaw/.env` wirken erst nach
  `systemctl --user restart openclaw-gateway.service`.
- `scripts/openclaw-ask.sh` endet mit Exit 3: Die Unit läuft nicht. `task openclaw:start`, dann
  `task openclaw:logs` lesen.
- `:1919` ist offline: Das lokale Modell läuft Windows-seitig und ist nicht immer gestartet.
  Prüfen mit `curl -s "${OPENCLAW_LOCAL_BASE_URL:-http://127.0.0.1:1919/v1}/models"`. Solange es
  offline ist, läuft jeder Heartbeat über den Fallback `opencode-go/muse-spark-1.3-contributor`.
  Start des lokalen Backends: `docs/runbooks/freetoken-native.md`.
- Der Fallback antwortet mit `MissingSessionID`: Die Provider-Header fehlen (siehe R4).
- Der Bot reagiert nicht auf Nachrichten: Pairing fehlt. `openclaw pairing list telegram`
  prüfen und den Code freigeben. In Gruppen antwortet der Bot nur bei Erwähnung.
- Befunde kommen nicht an: `TELEGRAM_CHAT_ID` in `~/.openclaw/.env` fehlt, oder der Scratch ist
  leer. `openclaw cron scratch <jobId>` zeigt den eingespielten Inhalt.

## Neovim-Anbindung (T900794)

Neovim spricht ausschließlich über CLI und Gateway-HTTP mit OpenClaw —
Terminal-Multiplexing (tmux/screen-Sessions, `:terminal`-Steuerung) ist
explizit ausgeschlossen.

- CLI (Broker): `scripts/openclaw-ask.sh [--agent <id>] "<aufgabe>"` — Exit-Codes
  siehe „Broker für andere Agenten" oben.
- Gateway-HTTP direkt (Health und Agent-Aufrufe):
  ```bash
  curl -fsS http://127.0.0.1:18789/healthz
  curl -fsS -H "Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d '{"agent":"task-runner","message":"Welche Pods laufen nicht?"}' \
    http://127.0.0.1:18789/v1/chat/completions
  ```
- Rolle und Werkzeugsatz der Harness: `openclaw-ops`
  (`docs/agent-guide/registry/capabilities.yaml`, Harness `openclaw`) —
  Kubernetes lesen, Taskfile-Ziele, OpenClaw-Broker. Adapter:
  `scripts/toolset/lib/adapters/openclaw.mjs` (User-Scope lesen/validieren,
  `openclaw mcp doctor --probe`, kein Schreiben in CI).

## Offene Nutzeraufgaben (R4, R5)

- R4: OpenCode Go verlangt den Header `x-opencode-session` mit dem Wert aus
  `OPENCLAW_GO_SESSION` und einen eigenen User-Agent. Die Vorlage enthält an der Stelle des
  Providers `opencode-go` nur einen Kommentar. Beide Header trägt der Nutzer in
  `~/.openclaw/openclaw.json` nach dem Schlüssel ein, den die installierte Version dokumentiert,
  und prüft mit `openclaw config validate`. Ohne diese Header antwortet Go mit
  `MissingSessionID`, und der Fallback greift nicht.
- R5: `OPENCLAW_GO_SESSION` gilt für das ganze Gateway, nicht pro Gespräch. Alle Gespräche teilen
  sich damit eine Go-Session. Wer das ändern will, entscheidet über die Session-Granularität
  selbst.

## Rückbau

- Vorherigen Zustand wiederherstellen: stoppt und deaktiviert die Unit, entfernt
  `~/.local/opt/openclaw` und `~/.openclaw` und verschiebt das neueste `~/.openclaw.bak.*`
  zurück. Node 24 bleibt installiert.
  ```bash
  task openclaw:restore
  ```
- Alles entfernen (Unit, Prefix, Node 24, `~/.openclaw` und alle Backups):
  ```bash
  task openclaw:wipe CONFIRM=yes
  ```
