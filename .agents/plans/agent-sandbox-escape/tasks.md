---
title: Agent-Sandbox gegen Host-Sockets und /mnt abschotten, run_command des Direkt-Workers sandboxen
ticket_id: none
domains: [llm, security, scripts]
status: planning
---
# agent-sandbox-escape — Implementation Plan

## File Structure

- `scripts/lib/agent-sandbox.sh`: `/run` und `/mnt` als leere tmpfs, Resolver-Verzeichnis aus `/etc/resolv.conf` read-only zurückbinden, Python-User-Site read-only zurückbinden, Kopfkommentar um die neuen Grenzen ergänzen.
- `scripts/llm/plan-runner/direct-worker.mjs`: `runCommand` startet den Befehl über `agent_sandbox_run`, Timeout und Kill über die Prozessgruppe.
- `tests/py/spec/native_ported/spec/llm-local-dev/test_agent_sandbox.py`: RED-Tests `test_host_runtime_sockets_and_mounts_are_invisible`, Positiv-Anker `test_resolver_config_stays_readable` (bereits im Branch).
- `tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_direct_worker.py`: RED-Tests `test_run_command_executes_model_written_code_inside_the_sandbox`, `test_run_command_refuses_to_run_without_a_working_sandbox` (bereits im Branch). Bestehende Ausführungstests von `run_command` brauchen danach ein lauffähiges bwrap oder `AGENT_SANDBOX=off`.
- `components/website/src/data/test-inventory.json`: per `task test:inventory` regeneriert.

## Partials

| id | plan | role | target_files | depends_on |
|---|---|---|---|---|
| p1 | tasks.md | impl | scripts/lib/agent-sandbox.sh, scripts/llm/plan-runner/direct-worker.mjs, tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_direct_worker.py, components/website/src/data/test-inventory.json | |

## Ursache (belegt, nicht angenommen)

Symptom und Beleg, gemessen am 2026-10-15 auf dem WSL-Host mit `main` 84a33883c:

```bash
. scripts/lib/agent-sandbox.sh; d=$(mktemp -d)
agent_sandbox_run "$d" -- bash -c 'curl -s --unix-socket /run/docker.sock http://x/version | head -c 80; ls /mnt/c | head -1; ls -d /run/dbus /run/WSL /run/user/*/bus'
```

Ausgabe: Docker-API antwortet (`Docker Desktop 4.94.0`), `/mnt/c` ist lesbar, D-Bus-System- und Session-Bus sowie `/run/WSL` sind sichtbar. Ursache: `--ro-bind / /` bindet `/run` und `/mnt` mit; read-only verhindert keinen `connect()` auf Unix-Sockets. Docker-API-Zugriff ist faktisch Host-Root.

Zweiter Pfad: `runCommand` in `direct-worker.mjs` startet `python3 -m pytest` per `spawn` ohne Sandbox. Die Allowlist begrenzt den Befehl, pytest führt aber vom Modell geschriebene Test- und `conftest.py`-Dateien mit Betreiberrechten aus (HOME, Sockets, Schreibzugriff überall).

Bewusst außerhalb des Umfangs: geteiltes Netz (`--share-net`) für den Modell-Proxy auf 127.0.0.1. TCP-Dienste auf localhost und abstrakte Unix-Sockets bleiben erreichbar. Das steht bereits im Skriptkopf und wird dort um den Hinweis auf abstrakte Sockets ergänzt.

## Umfang und Gates

S1 gemäß `docs/code-quality/gates.yaml`, keine der Dateien ist gebaselined:

| Datei | Ist | Budget |
|---|---|---|
| `scripts/lib/agent-sandbox.sh` | 103 | 697 |
| `scripts/llm/plan-runner/direct-worker.mjs` | 253 | 547 |
| `tests/py/spec/native_ported/spec/llm-local-dev/test_agent_sandbox.py` | 182 | 618 |
| `tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_direct_worker.py` | 318 | 482 |

S2: keine neuen Importe. S3: keine Hostnamen. S4: keine neuen Skripte. CI hat kein lauffähiges bwrap (`grep -rn bwrap .github/workflows` ergibt 0 Treffer): Die bwrap-Tests skippen dort sichtbar, nur `test_run_command_refuses_to_run_without_a_working_sandbox` läuft in CI.

## Task 1: RED bestätigen

```bash
python3 -m pytest -q -p no:cacheprovider tests/py/spec/native_ported/spec/llm-local-dev/test_agent_sandbox.py tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_direct_worker.py
```

RED expected: FAIL bei genau drei Tests: `test_host_runtime_sockets_and_mounts_are_invisible` (viele Einträge unter `/run`, `/mnt` nicht leer), `test_run_command_executes_model_written_code_inside_the_sandbox` (`test_escape` liest das Fake-Secret), `test_run_command_refuses_to_run_without_a_working_sandbox` (Befehl läuft trotz kaputtem bwrap). `test_resolver_config_stays_readable` ist grün und muss es bleiben. Ein Skip zählt nicht als RED, der Lauf braucht lokal ein lauffähiges bwrap.

## Task 2: `agent_sandbox_run` härten

In `scripts/lib/agent-sandbox.sh`, Funktion `agent_sandbox_run`:

1. Die Basis-Argumente um `--tmpfs /run --tmpfs /mnt` erweitern, direkt nach `--tmpfs /tmp`. Spätere `--bind`/`--ro-bind` legen ihre Mountpunkte im tmpfs neu an, ein Worktree unter `/mnt` bleibt damit nutzbar.
2. Resolver zurückbinden: `realpath /etc/resolv.conf` auflösen. Liegt das Ziel unter `/run/`, dessen Verzeichnis zu `ro` hinzufügen (systemd-resolved: `/run/systemd/resolve`). So bleibt DNS unabhängig vom Resolver-Layout erhalten.
3. Python-User-Site zurückbinden: Ist der Befehl `python3` oder `python`, `"$1" -c 'import site; print(site.getusersitepackages())'` auflösen und per `realpath` zu `ro` hinzufügen, wenn das Verzeichnis existiert. Ohne diesen Schritt verdeckt das tmpfs-HOME ein per `pip install --user` installiertes pytest.
4. Kopfkommentar: unter „Grenzen der Sandbox“ `/run` und `/mnt` als leer dokumentieren, den Resolver als einzige Ausnahme nennen und unter „Netz“ ergänzen, dass abstrakte Unix-Sockets mit dem Netz-Namespace geteilt bleiben.

```bash
python3 -m pytest -q -p no:cacheprovider tests/py/spec/native_ported/spec/llm-local-dev/test_agent_sandbox.py
```

Erwartet: alle Tests grün, inklusive `test_resolver_config_stays_readable` und der bestehenden Git- und Timeout-Tests.

## Task 3: `runCommand` über die Sandbox starten

In `scripts/llm/plan-runner/direct-worker.mjs`:

1. Neben `COMMAND_TIMEOUT_MS` den Pfad `SANDBOX_LIB` auf `scripts/lib/agent-sandbox.sh` relativ zum Modul setzen (`new URL('../../lib/agent-sandbox.sh', import.meta.url)`).
2. In `runCommand` statt `spawn(argv[0], argv.slice(1), …)` folgendes starten: `spawn('bash', ['-c', '. "$1"; shift; agent_sandbox_run "$@"', 'agent-sandbox', SANDBOX_LIB, worktree, '--timeout', String(COMMAND_TIMEOUT_MS / 1000), ...envFlags, '--', ...argv], { cwd: worktree, env: commandEnv(worktree), detached: true, stdio: … })`. `envFlags` enthält `--env <NAME>` für jeden in `commandEnv` gesetzten Schlüssel außer PATH, HOME, LANG, LC_ALL und TERM, die `agent_sandbox_run` selbst setzt. `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL`, `PYTEST_JOBS` und `PYTEST_LOCAL` kommen dadurch in der Sandbox an.
3. Der bestehende Kill-Timer schickt `SIGKILL` an die Prozessgruppe (`process.kill(-child.pid, 'SIGKILL')`, in try/catch), nicht nur an bash. `--timeout` in der Sandbox ist die erste Grenze, der Timer bleibt als Fallback.
4. `AGENT_SANDBOX` in `ENV_PASSTHROUGH` aufnehmen, damit `AGENT_SANDBOX=off` als bewusster Opt-out wirkt. Der Exit 3 von `agent_sandbox_check` landet samt stderr-Meldung („bwrap“) unverändert im Tool-Ergebnis `exit 3`.
5. Bestehende Tests in `test_plan_runner_direct_worker.py`, die einen erlaubten Befehl wirklich ausführen (`test_commands_do_not_inherit_secrets_from_the_runner_env`, `test_allowed_command_runs_with_cwd_in_the_worktree_and_without_a_shell`), bekommen dasselbe `skipif(not _bwrap_works())` wie der neue Sandbox-Test. Den Opt-out nicht als Ausweg für CI nutzen, sonst prüfen die Tests den unsandboxten Pfad.

```bash
python3 -m pytest -q -p no:cacheprovider tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_direct_worker.py
```

Erwartet: alle Tests grün. Danach einen echten Lauf nachweisen, dass `npx vitest run` und `node --test` in der Sandbox starten (Node unter `~/.nvm` wird von `agent_sandbox_run` zurückgebunden). Den Befehl und seine Ausgabe in die Evidenz übernehmen.

## Task 4: Verifikation

```bash
task test:inventory
task test:changed
task freshness:regenerate
```

Generierte Änderungen prüfen und mit Implementierung und Tests committen. Danach:

```bash
task freshness:check
```

Abnahme: die vier neuen Tests grün auf einem Host mit bwrap, in CI genau ein neuer Test aktiv und grün, keine Regression in `pi-swarm.sh` und `harness-ctx-compare.sh` (beide nutzen `agent_sandbox_run` unverändert). PR als Draft öffnen, weil Auto-Merge Nicht-Drafts sofort merged.
