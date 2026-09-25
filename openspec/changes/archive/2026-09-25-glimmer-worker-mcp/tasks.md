---
title: "glimmer-worker-mcp — Implementation Plan"
ticket_id: T900373
domains: [llm, mcp, scripts, tests]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# glimmer-worker-mcp — Implementation Plan

_Ticket: T900373 · Design: `openspec/changes/glimmer-worker-mcp/design.md` (D1–D8)._

**Ziel:** Muse Code (WSL und Windows) kann über das MCP-Werkzeug `glimmer_worker_*` Aufgaben an Glimmer auf
`:1919` delegieren; ein Job läuft als opencode `glimmer-primary` im Ziel-Repo. Ein Partial, sequentiell.

## File Structure

| Datei | Aktion |
|---|---|
| `scripts/glimmer-worker-mcp/lib.mjs` | neu — reine Funktionen: Pfad-Mapping (D6), Job-Queue (D4/D5), Ergebnis-Aufbereitung |
| `scripts/glimmer-worker-mcp/server.mjs` | neu — HTTP/JSON-RPC-Hülle, Tools, Sicherheitsgrenze (D3) |
| `scripts/glimmer-worker-mcp/package.json` | neu — `{"type":"module","private":true}` |
| `scripts/glimmer-worker-mcp/glimmer-worker-mcp.service` | neu — systemd-User-Unit mit `# Status:`-Kopfzeile |
| `scripts/glimmer-worker-mcp/install.sh` | neu — Token, Unit, Registrierung in beiden Muse-`settings.json` (D7) |
| `scripts/glimmer-worker-mcp/README.md` | neu — Zweck, Tools, Installation, Grenzen |
| `taskfiles/Taskfile.llm.yml` | Task `glimmer-worker:install` (→ `task llm:glimmer-worker:install`) |
| `tests/spec/llm-local-dev/glimmer-worker-mcp.bats` | neu — Laufzeittests gegen den echten Server mit opencode-Stub |
| `components/website/src/data/test-inventory.json` | regeneriert |

Neue Dateien, kein Baseline-Eintrag; S1-Limits `.mjs` 800, `.sh` 800. Zielgrößen: `server.mjs` < 300,
`lib.mjs` < 250, `install.sh` < 150 Zeilen. Nichts in `components/website/src` wird geändert.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Task 1 — Laufzeittests zuerst (RED)

- [ ] **1.1** `tests/spec/llm-local-dev/glimmer-worker-mcp.bats` anlegen. Kopfkommentar: Prüfmodus
  Output-Verifikation. Der Server wird **gestartet** und per `curl` angesprochen, opencode ist durch einen Stub
  ersetzt.
  - `setup_file`: freier Port (`python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])'`),
    Token `test-token`, Stub `$BATS_FILE_TMPDIR/bin/opencode`, der seine Argumente nach
    `$BATS_FILE_TMPDIR/argv` schreibt, im `--dir`-Verzeichnis `echo edited >> worked.txt` ausführt und
    `worker done` ausgibt. Temp-Git-Repo mit einem Commit. Server mit `GLIMMER_WORKER_OPENCODE`,
    `GLIMMER_WORKER_MCP_PORT`, `GLIMMER_WORKER_MCP_TOKEN` und `GLIMMER_WORKER_LLAMA_URL=http://127.0.0.1:9`
    (tot) im Hintergrund starten, auf `/health` warten. `teardown_file` beendet ihn.
  - Tests:
    1. `/health` liefert `ok: true` (Positiv-Anker).
    2. `tools/list` ohne Bearer → HTTP 401; mit Bearer → genau die drei Tool-Namen.
    3. `glimmer_worker_start` mit Git-Repo → `job_id`; `glimmer_worker_result` (`wait_s` 20) → `status`
       `done`, `exit_code` 0, `git_status` enthält `worked.txt`, `summary` enthält `worker done`; `argv`
       enthält `--agent glimmer-primary` und `--dir <repo>`.
    4. `glimmer_worker_start` mit `cwd` außerhalb eines Git-Baums (`$BATS_FILE_TMPDIR/nogit`) → `isError`.
    5. Pfad-Mapping über `node -e` gegen `lib.mjs`: die drei Fälle aus dem Spec-Szenario.
    6. `glimmer_worker_status` bei totem `:1919`-Ziel → `llama.ok` false, kein Absturz.
    7. Installer gegen Temp-Settings: `GLIMMER_WORKER_MUSE_SETTINGS="$a $b" bash install.sh --register-only`
       mit einer Datei, die `factory-mcp-node` führt, und einer ohne `mcpServers` → beide Dateien führen
       `glimmer-worker` mit URL `http://127.0.0.1:13007/mcp` und Bearer; `factory-mcp-node` bleibt, `.bak` existiert.
    8. `docs/agent-guide/registry/mcp.yaml` nennt `glimmer-worker` nicht (Positiv-Anker: Datei nennt `factory-mcp`).
- [ ] **1.2** Rotlauf:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/glimmer-worker-mcp.bats
# expected: FAIL (red — scripts/glimmer-worker-mcp/ existiert noch nicht)
```

- [ ] **1.3** Commit: `test(test): glimmer-worker-mcp runtime tests [T900373]`.

## Task 2 — `lib.mjs` (reine Logik)

- [ ] **2.1** `toWslPath(p)`: `^[A-Za-z]:[\\/]` → `/mnt/<lower>/…` mit `/`; `^\\\\wsl(\.localhost|\$)\\[^\\]+\\` → `/…`;
  sonst unverändert. Trailing Slashes normalisieren.
- [ ] **2.2** `class JobQueue`: `enqueue({task, cwd, timeoutS})` → `{id, position}` (id per `crypto.randomUUID()`),
  FIFO, genau ein laufender Job; `runner`-Callback injizierbar (für Tests und `server.mjs`); `get(id)`;
  `waitFor(id, ms)` (Promise, löst bei Statuswechsel auf Endzustand oder nach `ms`); Aufräumen beendeter Jobs
  nach 3600 s. Endzustände `done|failed|timeout`.
- [ ] **2.3** `summarize({stdout, stderr, code, cwd})`: letzte 6000 Zeichen (ANSI-Escapes entfernt),
  `git -C cwd status --porcelain` und `git -C cwd diff --stat` via `spawnSync` (Timeout 10 s).
- [ ] **2.4** `node --check scripts/glimmer-worker-mcp/lib.mjs`.

## Task 3 — `server.mjs`, Unit, `package.json`

- [ ] **3.1** HTTP-Hülle nach `scripts/factory-mcp-node/server.mjs` (Z. 629–759): `/health`, `GET /mcp` → 405,
  `POST /mcp` mit `guardRequest` vor dem Body-Lesen, JSON-RPC `initialize`/`ping`/`tools/list`/`tools/call`,
  SSE-Antwort bei `Accept: text/event-stream`, Notification ohne id → 204. `tools/call` ist hier `async`
  (wegen `waitFor`).
- [ ] **3.2** Tools (Schemas mit `required`):
  - `glimmer_worker_start` `{task: string, cwd: string, timeout_s?: integer 60..3600}`: `toWslPath`, Prüfen per
    `git -C <cwd> rev-parse --is-inside-work-tree`, sonst `isError`. Runner: `spawn(opencode, ['run','--agent','glimmer-primary','--dir',cwd,task])`
    mit `cwd`, Umgebung `NO_COLOR=1`, Kill nach Timeout (SIGTERM, 10 s später SIGKILL). Beschreibung nach D8:
    „Delegate a self-contained coding task (clear goal, files, acceptance check) to the local Muse Glimmer 30B
    worker on this machine. Returns a job_id immediately; poll glimmer_worker_result. Review the returned diff
    before accepting the change.“
  - `glimmer_worker_result` `{job_id: string, wait_s?: integer 0..55}` → JSON-Text mit `status`, `exit_code`,
    `duration_s`, `summary`, `git_status`, `diff_stat`, `position`.
  - `glimmer_worker_status` `{}` → `llama: {ok, model, n_ctx}` aus `GET <llama>/health` und `/props`
    (Timeout 3 s, `GLIMMER_WORKER_LLAMA_URL` Default `http://127.0.0.1:1919`), `running`, `queued`.
- [ ] **3.3** `package.json` `{"name":"glimmer-worker-mcp","type":"module","private":true}`.
- [ ] **3.4** `glimmer-worker-mcp.service`: `# Status: Aktiv (T900373) — MCP-Brücke Muse Code → Glimmer (:1919).`
  in den ersten Zeilen; `ExecStart=/usr/bin/env node %h/Bachelorprojekt/scripts/glimmer-worker-mcp/server.mjs`,
  `EnvironmentFile=%h/.config/glimmer-worker-mcp/server.env`, `Restart=on-failure`, `After=glimmer.service`.
- [ ] **3.5** Testlauf Task 1: Tests 1–6 grün.
- [ ] **3.6** Commit: `feat(mcp): glimmer-worker-mcp server for Muse Code [T900373]`.

## Task 4 — Installer, Task, README

- [ ] **4.1** `install.sh [--register-only]`: ohne Flag Token erzeugen, falls `server.env` fehlt
  (`openssl rand -hex 32`, `umask 077`), Unit nach `~/.config/systemd/user/` verlinken, `daemon-reload`,
  `enable --now`, `/health` abwarten. Danach immer: Zieldateien aus `GLIMMER_WORKER_MUSE_SETTINGS`
  (Leerzeichen-getrennt) oder Default `~/.config/muse/settings.json` plus Windows-Pfad aus
  `wslpath "$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')"`/.config/muse/settings.json
  (nur wenn `cmd.exe` erreichbar). Je Datei: `.bak` schreiben, `jq` setzt
  `.mcpServers["glimmer-worker"] = {type:"http", url:"http://127.0.0.1:13007/mcp", headers:{Authorization:("Bearer "+$tok)}}`.
  Das Token wird nie ausgegeben. Abschluss: `tools/list` per `curl` mit Bearer und Anzahl der Tools melden.
- [ ] **4.2** `taskfiles/Taskfile.llm.yml`: Task `glimmer-worker:install` (desc mit T900373), ruft `bash scripts/glimmer-worker-mcp/install.sh`.
- [ ] **4.3** `README.md`: Zweck, Befund (kurz, mit Verweis auf das Design), Tools, Installation, Grenzen
  (ein Slot, nur Git-Repos, nicht in der MCP-Registry).
- [ ] **4.4** Testlauf Task 1: alle Tests grün.
- [ ] **4.5** Commit: `feat(scripts): glimmer-worker installer and task [T900373]`.

## Task 5 — Installation auf dem Host und End-to-End-Nachweis

- [ ] **5.1** `task llm:glimmer-worker:install`: Unit aktiv, `curl -s 127.0.0.1:13007/health`, beide
  Muse-Settings enthalten `glimmer-worker`.
- [ ] **5.2** Windows-Erreichbarkeit: aus PowerShell `Invoke-RestMethod http://127.0.0.1:13007/health`.
- [ ] **5.3** E2E WSL: `muse exec --trust-workspace` in einem Wegwerf-Git-Repo mit Bug und BATS-Test und dem
  Auftrag, den Fix an `glimmer_worker_start` zu delegieren und das Ergebnis zu prüfen. Erwartet: ein Job im
  Server-Log (`journalctl --user -u glimmer-worker-mcp`), Fix angewendet, Test grün.
- [ ] **5.4** E2E Windows: dasselbe mit der Windows-Muse (`muse.cmd exec …`) in einem Repo unter `C:\`
  (Pfad-Mapping `/mnt/c/...`). Ergebnis und Befehle als Ticket-Kommentar.

## Task 6 — Finale Verifikation

- [ ] **6.1** Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/openspec.sh validate
bash scripts/plan-lint.sh openspec/changes/glimmer-worker-mcp/tasks.md
```

- [ ] **6.2** `task test:inventory`, regenerierte Dateien committen: `chore(scripts): regenerate inventories [T900373]`.
