---
title: plan-runner auf die laufende Fleet umstellen (Direkt-vLLM-Worker, Muse-Fallback, Endpunkt-Preflight)
ticket_id: T016656
domains: [llm, plan-runner, dev-flow]
status: planning
---
# plan-runner-live-fleet — Implementation Plan

## File Structure

- `scripts/llm/plan-runner/direct-worker.mjs` (neu): In-Process-Tool-Loop gegen vLLM `:8123` (`w4a4`), ohne opencode. Ersetzt den toten 4B-Track.
- `scripts/llm/plan-runner/workers.mjs`: Tracks `direct` (ersetzt `4b`), `cloud` (opencode-Agent `plan-worker-muse`, ersetzt `vllm`), `self` unverändert. `decideTrack` mit `selfAvailable`.
- `scripts/llm/plan-runner.mjs`: CLI `--direct-slots`/`--cloud-slots`, Endpunkt-Preflight für Orchestrator, Direkt- und Self-Track, Orchestrator-Fallback `:1919` → `:8123`.
- `scripts/llm/plan-runner/plan.mjs`: klare Fehlermeldung bei falscher Manifest-Kopfzeile, `autoSlots` liefert `slotsDirect`/`slotsCloud`.
- `.opencode/agent-models.jsonc`: Provider `llamacpp-qwen3` (:8080) und `llamacpp-cpu-2b` (:18199) sowie Agents `qwen35-4b`, `plan-worker-qwen35`, `plan-worker-cpu2b`, `plan-worker-vllm` entfernen, `plan-worker-muse` ergänzen. Die Datei ist Quelle für `scripts/opencode-sync-agents.sh`, das in die globale `~/.config/opencode/opencode.jsonc` merged; ohne diese Löschung spielt der nächste Sync die mit dotfiles #131 entfernten Einträge wieder ein.
- `docs/runbooks/plan-runner.md`: Tracks, Flags, Preflight, Fallback.
- `tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner.py`: an neue Tracks und Flags anpassen.
- `tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_direct_worker.py` (neu) und `tests/spec/llm-local-dev/fixtures/plan-runner-fake-openai-worker.mjs` (neu): Direkt-Worker gegen Fake-OpenAI-Server.

S1 laut `docs/code-quality/gates.yaml` (`.mjs` 800, `.py` 800), keine der Dateien ist in `docs/code-quality/baseline.json` erfasst. Ist-Werte: `plan-runner.mjs` 536, `workers.mjs` 208, `plan.mjs` 234, `test_plan_runner.py` rund 500 Zeilen. `direct-worker.mjs` soll unter 350 Zeilen bleiben. S2 keine Zyklen (direct-worker importiert nur `plan.mjs`), S3 keine neuen Hostnamen (nur `127.0.0.1` über Env-Defaults wie bisher), S4 keine neuen Skripte außerhalb des Runner-Moduls.

## Partials

| id | file | role | target_files | depends_on |
| --- | --- | --- | --- | --- |
| p1 | tasks.md | impl | scripts/llm/plan-runner/direct-worker.mjs | |
| p2 | tasks.md | impl | scripts/llm/plan-runner/workers.mjs, scripts/llm/plan-runner.mjs, scripts/llm/plan-runner/plan.mjs | p1 |
| p3 | tasks.md | impl | .opencode/agent-models.jsonc, docs/runbooks/plan-runner.md | |
| p4 | tasks.md | tests | tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner.py, tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_direct_worker.py, tests/spec/llm-local-dev/fixtures/plan-runner-fake-openai-worker.mjs | |

Reihenfolge: p4 schreibt zuerst die roten Tests (Task 1). Danach p1, p2 und p3, zum Schluss Task 6 grün.

## Ausgangslage (belegt am 2026-10-14)

- `:1919` (`qwen38-gsq-iq3xxs.service`) ist deaktiviert, `:8080` (Windows-4B-Pool) nicht erreichbar. Live sind vLLM `:8123` (`w4a4`, Tool-Parser `qwen3_coder` seit dotfiles #130) und 2B `:8096`.
- Mit `PLAN_RUNNER_ORCH_URL=http://127.0.0.1:8123 PLAN_RUNNER_ORCH_MODEL=w4a4` läuft der Orchestrator-Loop live (dispatch → wait → mark → finish).
- `opencode run --agent plan-worker-vllm` auf `w4a4` scheitert mit "Nothing to compact yet": die opencode-Sitzung sprengt das 32k-Fenster.
- Ein JSON-Edit-Paket direkt an `:8123` hat für dotfiles T016655 korrekt gearbeitet. Das ist das Muster für den Direkt-Worker.
- dotfiles #131 hat `plan-worker-qwen35` und `plan-worker-cpu2b` aus der globalen opencode-Config entfernt.

## Entscheidungen

- D1: Der Direkt-Worker ersetzt den 4B-Track. Er spricht OpenAI-kompatibel mit `PLAN_RUNNER_DIRECT_URL` (Default `http://127.0.0.1:8123`) und `PLAN_RUNNER_DIRECT_MODEL` (Default `w4a4`).
- D2: Der Cloud-Track nutzt opencode mit Agent `plan-worker-muse` (Modell `opencode/muse-spark-1.3-contributor-free`). Default `--cloud-slots 1`, abschaltbar mit `--cloud-slots 0`.
- D3: Rangfolge `direct` → `cloud` → `self`. `self` nur, wenn `:1919` beim Preflight antwortet. Sonst wartet der Scheduler auf freie Slots.
- D4: Orchestrator-URL: `PLAN_RUNNER_ORCH_URL` gewinnt. Ohne Env wird `:1919` geprobt, bei Ausfall `:8123` mit Modell `w4a4`. Der Log nennt die Wahl.
- D5: `--4b-slots` bleibt als Alias für `--direct-slots` mit Warnung. `--vllm-slots` bricht mit Exit 2 und Hinweis auf `--cloud-slots`/`--direct-slots` ab.

## Task 1: RED-Tests schreiben (p4)

`tests/spec/llm-local-dev/fixtures/plan-runner-fake-openai-worker.mjs`: HTTP-Server auf freiem Port, beantwortet `/v1/models` und `/v1/chat/completions` aus einem JSON-Skript (Liste von Antworten mit `tool_calls`), protokolliert jede Anfrage in eine Datei.

`test_plan_runner_direct_worker.py` deckt ab:
- Erfolgspfad: Skript ruft `write_file` auf eine Ziel-Datei und dann `finish(status=success)`. Erwartet: Datei geschrieben, Ergebnis `ok=true`.
- Schreibschutz: `write_file` auf eine Datei außerhalb von `target_files` liefert ein Tool-Ergebnis `ERROR: path not in target_files`, die Datei bleibt unberührt.
- Pfadausbruch: `../x` und absolute Pfade werden abgelehnt.
- `run_command` außerhalb der Allowlist wird abgelehnt, erlaubtes `python3 -m pytest` läuft mit `cwd=worktree`.
- Kein Tool-Call dreimal in Folge → `ok=false`, Summary `protocol error`.
- Turn-Limit erreicht → `ok=false`.

`test_plan_runner.py` erweitern:
- `decideTrack` bevorzugt `direct` vor `cloud` vor `self` und liefert `idle` statt `self`, wenn `selfAvailable=false`.
- `--vllm-slots 1` endet mit Exit 2 und nennt `--cloud-slots`.
- Manifest mit Kopfzeile `| Partial | ...` meldet `manifest: header must start with "id"` statt "depends on unknown partial".
- Orchestrator-Fallback: Fake-Orchestrator nur auf dem `:8123`-Ersatzport, `:1919`-Ersatz geschlossen → Lauf nutzt den Ersatz und loggt `orchestrator fallback`.

```bash
PYTEST_LOCAL=1 PYTEST_JOBS=0 bash scripts/pytest-run.sh -q tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_direct_worker.py tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner.py
```
expected: FAIL. Die neuen Tests schlagen fehl, weil `direct-worker.mjs` fehlt und die Flags noch alt sind. Bestehende Tests, die den 4B-Track über `plan-worker-qwen35` prüfen, werden auf `direct`/`plan-worker-muse` umgeschrieben, nicht gelöscht.

## Task 2: Direkt-Worker (p1)

`scripts/llm/plan-runner/direct-worker.mjs` exportiert `runDirectWorker({ prompt, worktree, targetFiles, timeoutMs, url, model, maxTurns = 40 })` und liefert dieselbe Form wie `runWorker`: `{ code, tail, ok, summary, ms }`.

- Tools: `read_file(path)`, `write_file(path, content)`, `replace_in_file(path, old, new)` (genau ein Treffer, sonst Fehler), `run_command(argv: string[])`, `finish(status: "success"|"failure", summary, changed_files)`.
- Pfadregeln: relativ zum Worktree, `realpath` muss im Worktree liegen. Schreiben nur für `targetFiles`, Lesen im ganzen Worktree.
- `run_command`: kein Shell-Aufruf (`spawn` mit Array). Allowlist der Präfixe: `python3 -m pytest`, `bash scripts/pytest-run.sh`, `node --test`, `npx vitest run`, `git diff`, `git status`. Timeout 300 s, Ausgabe auf 4000 Zeichen gekürzt.
- Request: `tool_choice: "required"`, `temperature: 0.2`, `max_tokens: 4096`. Tool-Ergebnisse über 4000 Zeichen kürzen. Meldet `usage.prompt_tokens` mehr als 28000, bricht der Worker mit `ok=false`, Summary `context budget exhausted` ab.
- `tail` enthält die letzte `PLAN-RUNNER-RESULT`-Zeile im bisherigen Format, damit `parseResult` und `mark()` unverändert bleiben.
- Gesamt-Timeout `timeoutMs` per `AbortSignal`.

## Task 3: Runner-Verdrahtung (p2)

- `workers.mjs`: `AGENT_4B` und `AGENT_VLLM` entfallen, `AGENT_CLOUD = 'plan-worker-muse'`. `WorkerPool({ slotsDirect, slotsCloud, ... , runDirect = runDirectWorker })`. `startDirect` ruft `runDirect` mit den `target_files` des Partials, `startCloud` ruft `runWorker` mit `AGENT_CLOUD`. `decideTrack({ ready, freeDirect, freeCloud, selfAvailable })`.
- `plan-runner.mjs`: `parseArgs` mit `--direct-slots`, `--cloud-slots`, Alias `--4b-slots`, Abbruch bei `--vllm-slots` (D5). Preflight über `/v1/models` mit 5 s Timeout für Orchestrator, Direkt-URL und `:1919` (Self). Ausfall setzt die Slots des Tracks auf 0 und loggt die URL. Orchestrator-Fallback nach D4. Die Tool-Namen `dispatch_4b`/`dispatch_vllm` im Orchestrator-Prompt werden zu `dispatch_direct`/`dispatch_cloud`.
- `plan.mjs`: `parseManifest` prüft, dass die erste Tabellenzeile mit `id` beginnt, sonst `manifest: header must start with "id"`. `autoSlots` liefert `{ width, slotsDirect, slotsCloud }`.

## Task 4: Agent-Konfiguration und Runbook (p3)

- `.opencode/agent-models.jsonc`: Provider `llamacpp-qwen3`, `llamacpp-cpu-2b` und Agents `qwen35-4b`, `plan-worker-qwen35`, `plan-worker-cpu2b`, `plan-worker-vllm` entfernen. Verweise anderer Agents (z. B. `task`-Freigaben auf `qwen35-4b` in `bp-*`) auf `vllm-4b` umstellen. `vllm-4b` ist in der globalen dotfiles-Config definiert und bleibt beim Merge erhalten. `plan-worker-muse` ergänzen: `mode: primary`, `model: opencode/muse-spark-1.3-contributor-free`, Prompt und Permissions wie bisher `plan-worker-vllm` (`edit`/`write`/`bash` allow, `task` deny).
- Prüfen: `grep -n 'qwen35-4b\|llamacpp-qwen3\|llamacpp-cpu-2b\|plan-worker-vllm' .opencode/` liefert 0 Treffer. Danach `bash scripts/opencode-sync-agents.sh --dry-run`. Der Merge (`*`) entfernt globale Einträge nicht, er darf nur `plan-worker-muse` hinzufügen. Der echte Sync und der zugehörige dotfiles-Commit liegen beim Orchestrator.
- `docs/runbooks/plan-runner.md`: Tracks, Flags, Preflight, Orchestrator-Fallback, Beispielaufruf `node scripts/llm/plan-runner.mjs .agents/plans/<slug> --worktree <abs> --direct-slots 3 --cloud-slots 1`.

## Task 5: Live-Smoke

Wegwerf-Repo mit einem Partial (`hello.txt` anlegen) wie im Befund vom 2026-10-14:

```bash
node scripts/llm/plan-runner.mjs <scratch>/.agents/plans/smoke --worktree <scratch> --direct-slots 1 --cloud-slots 0
```
Erwartet: Exit 0, `PLAN-RUNNER: done=1/1`, Log nennt `orchestrator fallback` auf `:8123`, `hello.txt` vorhanden. Danach dasselbe mit `--direct-slots 0 --cloud-slots 1`, Erwartung ebenfalls `done=1/1`.

## Task 6: Verifikation

```bash
PYTEST_LOCAL=1 PYTEST_JOBS=0 bash scripts/pytest-run.sh -q tests/py/spec/native_ported/spec/llm-local-dev/
task test:changed
task freshness:regenerate
task freshness:check
```
Erwartet: alle grün, von `task freshness:regenerate` erzeugte Änderungen mitcommitten.
