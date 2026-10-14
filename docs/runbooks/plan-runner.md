# Runbook: plan-runner (Plan-Partials mit lokalen Modellen)

`scripts/llm/plan-runner.mjs` führt die Partials eines gestagten Plans aus (T900504, umgestellt auf die
laufende Fleet mit T016656). Der Orchestrator steuert per Tool-Loop: Qwen3.8-27B auf `:1919`, und wenn
`:1919` nicht antwortet, vLLM `:8123` (`w4a4`, Tool-Parser `qwen3_coder`). Die Partials laufen auf drei Tracks,
in dieser Rangfolge:

| Track | Tool | Ausführung | Endpunkt |
| --- | --- | --- | --- |
| `direct` | `dispatch_direct` | In-Process-Tool-Loop (`direct-worker.mjs`), ohne opencode | vLLM `:8123`, `w4a4`, 32k |
| `cloud` | `dispatch_cloud` | `opencode run --agent plan-worker-muse` (Muse Spark 1.3, Go-Abo) | opencode |
| `self` | `execute_self` | `opencode run --agent plan-worker-self` | `:1919` |

`self` ist nur frei, wenn alle Worker-Slots belegt sind **und** `:1919` beim Preflight geantwortet hat. Sonst wartet
der Scheduler auf einen freien Slot. Während des Selbstaufrufs vergibt der Scheduler frei werdende Worker-Slots
selbst und meldet die Ergebnisse, sobald der Orchestrator zurückkehrt.

Warum ein Direkt-Worker statt opencode auf `:8123`: Eine volle opencode-Sitzung (globale und Projekt-Config,
Skills, MCP-Schemas) sprengt das 32k-Fenster von `w4a4` schon beim Start ("Nothing to compact yet"). Der
Direkt-Worker schickt nur seinen kurzen System-Prompt, die Partial und fünf Tool-Schemas. Der 4B-Pool `:8080`
und der CPU-2B-Pool `:18199` sind abgeschaltet (dotfiles #131), der 2B-Pool `:8096` hat mit 16k zu wenig Kontext
für Tool-Loops.

Module: `scripts/llm/plan-runner/plan.mjs` (Manifest, Abhängigkeiten, Zustand, Worker-Prompt),
`scripts/llm/plan-runner/workers.mjs` (Slot-Verwaltung, opencode-Prozesse, Track-Policy) und
`scripts/llm/plan-runner/direct-worker.mjs` (Direkt-Worker). Nur Node-Standardbibliothek.

## Voraussetzungen

- Direkt-Track: vLLM `serve-worker-vllm.service` auf `:8123` (`w4a4`, Tool-Parser `qwen3_coder`). Ist `:8123`
  beim Start nicht erreichbar, setzt der Preflight die Direkt-Slots auf 0 und loggt die URL.
- Cloud-Track: `opencode` im `PATH` und der Primär-Agent `plan-worker-muse` aus `.opencode/agent-models.jsonc`
  (nach `scripts/opencode-sync-agents.sh` auch in der globalen Config). `--cloud-slots 0` schaltet den Track ab.
- Self-Track: `qwen38-gsq-iq3xxs.service` auf `:1919` mit 1 Slot und `-cram 12288` (`--cache-ram` hält den
  Orchestrator-Kontext im Host-RAM, während der Selbstaufruf den Slot belegt) und der Agent `plan-worker-self`.
  Antwortet `:1919` nicht, ist der Track aus. Reine Selbstausführung (`--direct-slots 0 --cloud-slots 0`) geht
  deshalb nur mit laufendem `:1919`.
- Der Change hat eine `## Partials`-Tabelle in `tasks.md` (`id | plan | role | target_files | depends_on`), deren
  Kopfzeile mit `id` beginnt, und die Partial-Dateien unter `tasks.d/`. Die `target_files` der Partials sind
  disjunkt, weil die Worker gleichzeitig im selben Worktree arbeiten.

## Aufruf

```bash
node scripts/llm/plan-runner.mjs .agents/plans/<slug> --worktree <abs> --direct-slots 3 --cloud-slots 1
node scripts/llm/plan-runner.mjs .agents/plans/<slug> [--worktree <pfad>] [--direct-slots N|auto] [--cloud-slots N|auto] [--auto-slots] [--print-slots] [--max-turns N] [--timeout-min N]
```

- `--worktree`: Default ist das Git-Toplevel des Change-Ordners.
- `--direct-slots`: gleichzeitige Direkt-Worker (Default 3).
- `--cloud-slots`: gleichzeitige Cloud-Worker (Default 1, `0` = Track aus).
- `--4b-slots`: veralteter Alias für `--direct-slots`, loggt eine Warnung.
- `--vllm-slots`: entfernt, Exit 2 mit Hinweis auf `--cloud-slots`/`--direct-slots`.
- `--auto-slots`: beide Slot-Zahlen aus der maximalen Frontbreite des Partials-DAGs ableiten (Direkt zuerst bis
  Cap 3, Cloud nur für den Rest bis Cap 3; kleine Pläne lassen Cloud aus). Explizite Zahlen je Track gewinnen.
- `--print-slots`: gibt `{width, slotsDirect, slotsCloud, partials}` als JSON aus und startet nichts.
- `--max-turns`: Obergrenze der Orchestrator-Antworten (Default 200).
- `--timeout-min`: Timeout je Worker-Lauf (Default 120). Danach gilt der Lauf als `failure`.

## Preflight und Orchestrator-Fallback

Vor dem Start fragt der Runner `GET /v1/models` (Timeout 5 s) für den Orchestrator, den Direkt-Endpunkt und den
Self-Endpunkt. Ein toter Track bekommt 0 Slots bzw. "kein Self"; der Log nennt die URL.

Orchestrator-URL: `PLAN_RUNNER_ORCH_URL` gewinnt ohne Probe. Ohne Env wird `:1919` geprobt, bei Ausfall nimmt der
Runner `:8123` mit Modell `w4a4` und loggt `orchestrator fallback: ...`. Antwortet auch `:8123` nicht, endet der Lauf
mit Exit 1.

Env: `PLAN_RUNNER_ORCH_URL`, `PLAN_RUNNER_ORCH_MODEL`, `PLAN_RUNNER_ORCH_PRIMARY_URL` (Default `http://127.0.0.1:1919`),
`PLAN_RUNNER_ORCH_FALLBACK_URL` (Default `http://127.0.0.1:8123`), `PLAN_RUNNER_ORCH_FALLBACK_MODEL` (Default `w4a4`),
`PLAN_RUNNER_DIRECT_URL` (Default `http://127.0.0.1:8123`), `PLAN_RUNNER_DIRECT_MODEL` (Default `w4a4`),
`PLAN_RUNNER_SELF_URL` (Self-Preflight, Default die Primär-URL `:1919`), `PLAN_RUNNER_OPENCODE` (ersetzt das
`opencode`-Binary, Tests).

Exit-Codes: `0` alle Partials `done`, `1` mindestens eine `failed` oder Lauf abgebrochen (drei Antworten
ohne Tool-Call in Folge, `--max-turns` erreicht, Orchestrator nicht erreichbar), `2` Konfigurationsfehler
(Manifest, Pfade, Zustandsdatei, unbekannte oder entfernte Flags). Die letzte Zeile auf stdout lautet
`PLAN-RUNNER: done=<n>/<gesamt> failed=<n> open=<n> running=<n>`. Das Protokoll steht auf stderr.

## Direkt-Worker

Tools: `read_file`, `write_file`, `replace_in_file` (genau ein Treffer), `run_command`, `finish`.
Lesen im ganzen Worktree, Schreiben nur auf die `target_files` der Partial. Pfade sind relativ zum Worktree,
`realpath` muss im Worktree liegen (kein `..`, keine absoluten Pfade). `run_command` startet ohne Shell mit
`cwd=<Worktree>` und erlaubt nur die Präfixe `python3 -m pytest`, `bash scripts/pytest-run.sh`, `node --test`,
`npx vitest run`, `git diff`, `git status` (Timeout 300 s, Ausgabe auf 4000 Zeichen gekürzt). Request:
`tool_choice: "required"`, `temperature: 0.2`, `max_tokens: 4096`. Der Lauf endet mit `ok=false` bei drei Antworten
ohne Tool-Call (`protocol error`), beim Turn-Limit (40), bei `usage.prompt_tokens > 28000`
(`context budget exhausted`) und beim Gesamt-Timeout.

## Worker-Vertrag

Jeder Worker (Direkt, Cloud, Self) bekommt den vollständigen Text seiner Partial, den Worktree-Pfad und die Liste der Dateien,
die er ändern darf. Seine letzte Ergebniszeile muss `PLAN-RUNNER-RESULT: success <Kurzfassung>` oder
`PLAN-RUNNER-RESULT: failure <Grund>` lauten. Fehlt sie oder endet der Prozess mit Exit ≠ 0, gilt der
Lauf als `failure`. Ein Worker-Erfolg setzt die Partial nicht auf `done`. Das tut erst der
Orchestrator mit `mark`, nachdem er das Ergebnis geprüft hat. `mark(id, "open")` erlaubt zwei
Wiederholungen, danach wird die Partial `failed`.

## Zustandsdatei und Resume

Fortschritt und Orchestrator-Notizen liegen in `.agents/plans/<slug>/.plan-runner/state.json`. Die
Datei wird nach jedem Tool-Aufruf atomar geschrieben (Temp-Datei, dann `rename`).

Nach einem Abbruch (Ctrl-C, Absturz, Timeout) denselben Befehl erneut starten. Partials mit `done` oder
`failed` bleiben unverändert. Partials mit `running` werden auf `open` zurückgesetzt und neu vergeben. Die
Notizen aus dem letzten `execute_self` gehen als Kontext an den Orchestrator. Einen kompletten Neustart
erzwingt `rm -r .agents/plans/<slug>/.plan-runner`.

## Messgrundlage

`scripts/llm/measurements/2026-09-26-qwen38-gsq-iq2s-mtp.md` (Branch
`chore/llm-bench-orchestration-T900480`): Ein vom Selbstaufruf verdrängter 51k-Token-Orchestrator-Slot
kehrt mit `--cache-ram` in 2,9 s zurück (26 Token neu), kalt in 48 s. Explizites Slot-Save/Restore
erzwingt bei diesem Hybridmodell trotzdem ein volles Neu-Prefill und wird deshalb nicht verwendet.

## Tests

`test_plan_runner.py` prüft die Szenarien gegen einen Fake-Orchestrator und einen opencode-Stub,
`test_plan_runner_direct_worker.py` den Direkt-Worker gegen einen Fake-OpenAI-Server (keine GPU nötig):

```bash
bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner.py tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_direct_worker.py
```
