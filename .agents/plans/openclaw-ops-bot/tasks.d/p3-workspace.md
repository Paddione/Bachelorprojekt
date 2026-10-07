---
title: "p3 — Workspace und Runbook"
ticket_id: T900538
domains: [agent-tooling, llm-local-dev]
status: active
---

# p3 — Workspace und Runbook

Files: `openclaw/heartbeat-scratch.md` (neu), `openclaw/workspace/AGENTS.md` (neu),
`docs/runbooks/openclaw-ops-bot.md` (neu). Disjunkt zu p1, p2, p4, p5.

Bindender Vertrag: `openspec/changes/openclaw-ops-bot/design.md`, Komponente 3. Lege keine Datei
`HEARTBEAT.md` an, weder unter `openclaw/workspace/` noch anderswo. Alle drei Dateien
sind reines Markdown ohne S1-Limit. Schreibe jede Datei exakt mit dem Inhalt aus dem jeweiligen
Code-Block (ohne die äußeren vier Backticks). Ändere keine anderen Dateien.

Arbeitsverzeichnis für alle Prüfbefehle: das Repo-Wurzelverzeichnis des Worktrees.

Verifizierte Befehle (Stand 2026-09-27, lokal geprüft):

- `bash scripts/ticket.sh list --status plan_staged` ist gültig. `plan_staged` gehört zu den
  erlaubten Status-Werten, die Ausgabe ist ein JSON-Array mit dem Feld `updated_at`.
- `flux get kustomizations` kennt `--context` und `-A` als globale Flags.
- `gh run list` kennt `--branch` und `--limit`.
- OpenClaw-Doku: Die Quittung ohne Befund ist `NO_REPLY`, dann stellt OpenClaw nichts zu. Die
  Laufzeit liest Heartbeat-Anweisungen nur aus dem Monitor-Scratch des Heartbeat-Jobs, nicht aus
  dem Workspace. `task openclaw:start` spielt `openclaw/heartbeat-scratch.md` per
  `openclaw cron scratch <jobId> --file` ein (p1).

## Task 3.1: `openclaw/heartbeat-scratch.md` anlegen

Schreibe diese Datei direkt unter `openclaw/`, nicht unter `openclaw/workspace/`:

````markdown
# Heartbeat-Scratch (Agent ops)

Arbeitsverzeichnis: `/home/patrick/Bachelorprojekt`. Führe die vier Prüfungen der Reihe nach
aus. Jede nutzt genau einen Read-only-Befehl der Allowlist. Führe nichts aus, was nicht auf der
Allowlist steht, und ändere nichts.

## 1. Flux-Kustomizations auf fleet

Befehl: `flux get kustomizations --context fleet -A`

Befund: eine Zeile, deren Spalte `READY` den Wert `False` hat. Ausnahme: Kustomizations, deren
Name `korczewski` enthält. Sie sind per Design suspendiert und kein Befund.

## 2. Pods auf fleet

Befehl: `kubectl --context fleet get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded`

Befund: jede Zeile außer der Kopfzeile. Die Meldung `No resources found` ist kein Befund.

## 3. CI auf main

Befehl: `gh run list --branch main --limit 5`

Befund: ein Lauf mit dem Ergebnis `failure`.

## 4. Liegengebliebene Pläne

Befehl: `bash scripts/ticket.sh list --status plan_staged`

Die Ausgabe ist ein JSON-Array. Befund: ein Eintrag, dessen Feld `updated_at` mehr als
24 Stunden vor der aktuellen Zeit liegt. Ein leeres Array `[]` ist kein Befund.

## Fehlgeschlagene Befehle

Endet ein Befehl mit einem Exit-Code ungleich 0 oder ohne Verbindung zum Cluster, ist das ein
Befund. Das Symptom ist die Fehlermeldung. Ein fehlgeschlagener Befehl beweist nicht, dass alles
gesund ist.

## Antwort

- Kein Befund in allen vier Prüfungen: antworte genau `NO_REPLY` und sonst nichts.
- Mindestens ein Befund: antworte nur mit dem Befundtext, ohne `NO_REPLY`. Pro Befund drei
  Zeilen:
  - `Symptom:` was der Befehl zeigt (Name, Namespace, Status).
  - `Ursache (vermutet):` ein Satz.
  - `Empfehlung:` ein konkreter Befehl für den Nutzer. Du führst ihn nicht aus.
````

Prüfbefehl (Erwartung: Datei existiert, `NO_REPLY` kommt vor, `HEARTBEAT_OK` nicht, alle vier
Befehle stehen drin, `korczewski` ist als Ausnahme genannt, kein `HEARTBEAT.md` im Repo-Workspace):

```bash
f=openclaw/heartbeat-scratch.md
test -f "$f" && echo "exists"
test ! -e openclaw/workspace/HEARTBEAT.md && echo "no workspace HEARTBEAT.md"
grep -c 'NO_REPLY' "$f"                                       # >= 2
grep -c 'HEARTBEAT_OK' "$f"                                   # 0
grep -cF 'flux get kustomizations --context fleet -A' "$f"    # 1
grep -cF 'kubectl --context fleet get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded' "$f"  # 1
grep -cF 'gh run list --branch main --limit 5' "$f"           # 1
grep -cF 'bash scripts/ticket.sh list --status plan_staged' "$f"  # 1
grep -c 'korczewski' "$f"                                     # 1
```

## Task 3.2: `openclaw/workspace/AGENTS.md` anlegen

Die Datei muss 40 bis 60 Zeilen haben. Schreibe exakt diesen Inhalt:

````markdown
# OpenClaw-Ops-Agenten (ops, task-runner)

## Rolle

Du bist der Betriebsassistent des Bachelorprojekts. Zwei Agenten teilen diesen Workspace:

- `ops` prüft alle 30 Minuten den Zustand nach dem Heartbeat-Scratch und meldet Befunde per Telegram.
- `task-runner` nimmt Aufgaben anderer Agenten über `scripts/openclaw-ask.sh` an, ordnet sie
  einem Befehl zu, führt ihn read-only aus und antwortet synchron.

Repo-Pfad: `/home/patrick/Bachelorprojekt`. Führe jeden Befehl in diesem Verzeichnis aus. Der
Produktions-Kontext heißt `fleet`. Das Brand `korczewski` ist per Design suspendiert und kein
Befund.

## Read-only-Regel

- Du empfiehlst Änderungen. Du führst sie nicht aus.
- Erlaubt sind nur Befehle der Exec-Allowlist:
  - `kubectl [--context <ctx>] get|describe|logs|top ...`
  - `flux get ...`
  - `gh run list|view ...` und `gh pr list|view ...`
  - `git status|log|diff ...`
  - `task --list`
  - `bash scripts/ticket.sh list|get ...`
  - `bash scripts/vda.sh oracle "<ziel>" --dry-run`
- Die Werkzeuge `write`, `edit` und `apply_patch` sind gesperrt. Umgehe die Sperre nicht, etwa
  über Shell-Umleitungen, `sed -i` oder `tee`.
- Lies niemals Dateien unter `environments/.secrets/`. Gib keine Tokens, Passwörter oder Inhalte
  von `~/.openclaw/.env` aus.
- Task-Namen findest du mit `bash scripts/vda.sh oracle "<ziel>" --dry-run`. Den gefundenen
  Task führst du nicht aus, du empfiehlst ihn.

## Antwortformat für den Broker (task-runner)

Die erste Zeile ist genau eine dieser drei Formen:

- `RESULT: done`: Du hast die Aufgabe mit erlaubten Befehlen beantwortet. Danach folgen der
  ausgeführte Befehl in einem Code-Block und die relevante Ausgabe, gekürzt auf das Wesentliche.
- `RESULT: recommend`: Die Aufgabe verlangt eine Änderung. Danach folgen der empfohlene Befehl
  in einem Code-Block und ein Satz Begründung. Du führst ihn nicht aus.
- `RESULT: refused`: Die Aufgabe verlangt Secrets, liegt außerhalb des Repos oder ist unklar.
  Danach folgt ein Satz mit dem Grund.

Vor der ersten Zeile steht nichts. Antworte auf Deutsch und ohne Emojis.

## Heartbeat (ops)

Befolge den Heartbeat-Scratch. Ohne Befund antwortest du genau `NO_REPLY`. Mit Befund
antwortest du nur mit dem Befundtext, ohne `NO_REPLY`.
````

Prüfbefehl (Erwartung: Zeilenzahl zwischen 40 und 60, alle drei Ergebnisformen, Repo-Pfad und
Secrets-Verbot vorhanden):

```bash
f=openclaw/workspace/AGENTS.md
n=$(wc -l < "$f"); echo "lines=$n"; [ "$n" -ge 40 ] && [ "$n" -le 60 ] && echo "lines ok"
grep -c 'RESULT: done' "$f"                    # 1
grep -c 'RESULT: recommend' "$f"               # 1
grep -c 'RESULT: refused' "$f"                 # 1
grep -c '/home/patrick/Bachelorprojekt' "$f"   # 1
grep -c 'environments/.secrets/' "$f"          # 1
grep -c 'NO_REPLY' "$f"                        # 2
grep -c 'HEARTBEAT' "$f"                       # 0
```

## Task 3.3: `docs/runbooks/openclaw-ops-bot.md` anlegen

Schreibe exakt diesen Inhalt:

````markdown
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
````

Prüfbefehl (Erwartung: alle Pflichtschritte in Reihenfolge vorhanden, Smoke-Test, R4 und R5,
Rückbau):

```bash
f=docs/runbooks/openclaw-ops-bot.md
test -f "$f" && echo "exists"
grep -c 'task openclaw:install' "$f"                               # >= 1
grep -c 'task openclaw:configure' "$f"                             # >= 1
grep -c '@BotFather' "$f"                                          # 1
grep -c 'task openclaw:start' "$f"                                 # >= 1
grep -c 'openclaw pairing approve telegram <code>' "$f"            # 1
grep -c 'openclaw cron scratch <jobId>' "$f"                       # >= 2
grep -c 'TELEGRAM_CHAT_ID' "$f"                                    # >= 2
grep -c 'doctor --fix\|HEARTBEAT' "$f"                             # 0
grep -cF 'scripts/openclaw-ask.sh "Welche Pods laufen nicht?"' "$f" # 1
grep -cE '^- R4:|^- R5:' "$f"                                       # 2
grep -c 'task openclaw:restore' "$f"                               # 1
grep -c 'task openclaw:wipe CONFIRM=yes' "$f"                      # 1
grep -n 'openclaw:install\|BotFather\|openclaw:start\|pairing approve\|openclaw-ask.sh "Welche' "$f"  # Zeilennummern aufsteigend
```

## Task 3.4: Abschlussprüfung der drei Dateien

Keine Platzhalter, keine Emojis, keine Secrets-Literale, und nur die drei Zieldateien sind neu
oder geändert:

```bash
files="openclaw/heartbeat-scratch.md openclaw/workspace/AGENTS.md docs/runbooks/openclaw-ops-bot.md"
grep -nE 'TBD|TODO|FIXME|\?\?\?' $files; echo "placeholder-hits=$?"   # erwartet: placeholder-hits=1
grep -nE '[0-9a-f]{64}' $files; echo "hex-secret-hits=$?"             # erwartet: hex-secret-hits=1
wc -l $files                                                           # alle > 0
git status --porcelain -- openclaw/heartbeat-scratch.md openclaw/workspace docs/runbooks/openclaw-ops-bot.md
```

Akzeptanz: Alle Prüfbefehle aus Task 3.1 bis 3.4 liefern die angegebenen Werte. Die
Spec-Anforderung, dass `openclaw/heartbeat-scratch.md` jede Prüfung mit exaktem Befehl und
Befund-Bedingung nennt und `NO_REPLY` vorschreibt, prüft p5 per BATS.
