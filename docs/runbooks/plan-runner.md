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

Module: `scripts/llm/plan-runner/plan.mjs` (Manifest, Abhängigkeiten, Zustand, Worker-Prompt, Frontmatter-Felder),
`scripts/llm/plan-runner/workers.mjs` (Slot-Verwaltung, Worker-Prozesse, Track-Policy),
`scripts/llm/plan-runner/direct-worker.mjs` (Direkt-Worker), `scripts/llm/plan-runner/tiers.mjs` (Fallback-Kette,
Lease-Guard, Budget-Ledger), `scripts/llm/plan-runner/harness.mjs` (Harness-Adapter) und
`scripts/llm/plan-runner/events.mjs` (Ereignisstrom). Nur Node-Standardbibliothek.

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
node scripts/llm/plan-runner.mjs .agents/plans/<slug> [--worktree <pfad>] [--direct-slots N|auto] [--cloud-slots N|auto] [--auto-slots] [--print-slots] [--max-turns N] [--timeout-min N] [--budget-usd N] [--harness <id>] [--events <datei>]
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
- `--budget-usd`: Budget für Cloud-Läufe in USD (Default `PLAN_RUNNER_CLOUD_BUDGET_USD`, sonst 5). Siehe „Budget".
- `--harness`: erzwingt einen Harness für alle Partials (`auto`, `direct`, `opencode`, `muse`, `pi`, `claude`, `agy`),
  auch wenn er nur in der Cloud läuft; das Budget gilt dann genauso. Unbekannte Werte enden mit Exit 2.
- `--events`: Zieldatei des Ereignisstroms (Default `<change-dir>/.plan-runner/events.jsonl`).

## Preflight und Orchestrator-Fallback

Vor dem Start fragt der Runner `GET /v1/models` (Timeout 5 s) für den Orchestrator, den Direkt-Endpunkt und den
Self-Endpunkt. Ein toter Track bekommt 0 Slots bzw. "kein Self"; der Log nennt die URL.

Orchestrator-URL: `PLAN_RUNNER_ORCH_URL` gewinnt ohne Probe. Ohne Env wird `:1919` geprobt, bei Ausfall nimmt der
Runner `:8123` mit Modell `w4a4` und loggt `orchestrator fallback: ...`. Antwortet auch `:8123` nicht, endet der Lauf
mit Exit 1.

Env (Tiers, Harness, Budget): `PLAN_RUNNER_TIERS`, `PLAN_RUNNER_TIER2_URL`, `PLAN_RUNNER_TIER2_MODEL`,
`PLAN_RUNNER_CLOUD_HARNESS`, `PLAN_RUNNER_CLOUD_BUDGET_USD` (Default 5), `PLAN_RUNNER_LEASE_GUARD`,
`PLAN_RUNNER_CLAUDE_MODEL` (Default `sonnet`), `PLAN_RUNNER_AGY_MODEL`.

Env: `PLAN_RUNNER_ORCH_URL`, `PLAN_RUNNER_ORCH_MODEL`, `PLAN_RUNNER_ORCH_PRIMARY_URL` (Default `http://127.0.0.1:1919`),
`PLAN_RUNNER_ORCH_FALLBACK_URL` (Default `http://127.0.0.1:8123`), `PLAN_RUNNER_ORCH_FALLBACK_MODEL` (Default `w4a4`),
`PLAN_RUNNER_DIRECT_URL` (Default `http://127.0.0.1:8123`), `PLAN_RUNNER_DIRECT_MODEL` (Default `w4a4`),
`PLAN_RUNNER_SELF_URL` (Self-Preflight, Default die Primär-URL `:1919`), `PLAN_RUNNER_OPENCODE` (ersetzt das
`opencode`-Binary, Tests).

Exit-Codes: `0` alle Partials `done`, `1` mindestens eine `failed` oder Lauf abgebrochen (drei Antworten
ohne Tool-Call in Folge, `--max-turns` erreicht, Orchestrator nicht erreichbar), `2` Konfigurationsfehler
(Manifest, Pfade, Zustandsdatei, unbekannte oder entfernte Flags, ungültiges `PLAN_RUNNER_TIERS`, unbekannter
Harness), `3` keine Partial `failed`, aber mindestens eine `paused_budget` oder `paused_owner`. Die letzte Zeile auf
stdout lautet `PLAN-RUNNER: done=<n>/<gesamt> failed=<n> open=<n> running=<n> paused=<n>`. Das Protokoll steht auf stderr.

## Fallback-Kette (Tiers)

Scheitert ein Worker-Lauf oder läuft er in den Timeout, wählt der Runner selbst den nächsten Tier. Der Orchestrator
sieht nur das Endergebnis. Das gilt nur für Partials mit Kette: Sie steht im Frontmatter (`fallback:`) oder ergibt sich
aus gesetztem `PLAN_RUNNER_TIERS`. Ohne beides eskaliert der Runner nicht, der Fehlschlag geht wie bisher an den
Orchestrator (`mark open` oder `failed`), und es entsteht kein Cloud-Aufwand. Die erste Track-Wahl bleibt bei
`decideTrack` (unverändert). Die Tiers kommen aus
`PLAN_RUNNER_TIERS` (JSON-Array, ersetzt den Default; Strings der Form `$NAME` werden aus der Env ersetzt):

```json
[{"id":"5070ti","kind":"local","tracks":["direct","self"],"gpu":0},
 {"id":"3060ti","kind":"local","url":"$PLAN_RUNNER_TIER2_URL","model":"$PLAN_RUNNER_TIER2_MODEL"},
 {"id":"cloud","kind":"cloud","harness":"$PLAN_RUNNER_CLOUD_HARNESS"}]
```

- `5070ti` ist der bisherige lokale Weg (Track `direct` auf `:8123`, `self` auf `:1919`). `3060ti` gehört nur zur
  Kette, wenn `PLAN_RUNNER_TIER2_URL` gesetzt ist; er läuft über `pi` mit `--provider <tier.provider|tier.id>` und
  `--model <tier.model>`. Die Provider-Config mit der Tier-URL muss in `pi` hinterlegt sein.
- `cloud` nutzt als Eskalationsziel `claude -p --output-format json --model sonnet` (`PLAN_RUNNER_CLAUDE_MODEL`
  ändert das Modell). Ohne `PLAN_RUNNER_CLOUD_HARNESS` bleibt der Cloud-Track der ersten Wahl bei Muse
  (`dispatch_cloud` → `plan-worker-muse`); ist die Variable gesetzt, gilt sie für beide.
- Die Reihenfolge je Partial steht im Frontmatter der Partial-Datei: `fallback: [5070ti, cloud]`. Ohne Angabe (bei
  gesetztem `PLAN_RUNNER_TIERS`) gilt die Reihenfolge der Kette. Ein Tier wird je Partial höchstens einmal versucht. Eskalationsläufe belegen keinen
  Worker-Slot, sodass auch `--cloud-slots 0` die Eskalation in die Cloud nicht verhindert.
- Ein Tier mit `gpu` ist nur verfügbar, wenn `$PLAN_RUNNER_LEASE_GUARD <gpu>` mit Exit 0 endet (Wert darf Argumente
  enthalten, etwa `bash /pfad/gpu-lease-guard.sh`) und `/v1/models` antwortet. Exit 1, jeder andere Ausgang und ein
  unlesbarer Guard heißen „übersprungen" (`tier 5070ti skipped: ...` im Log). Es wird nie etwas gestoppt oder
  verdrängt. Ohne die Variable loggt der Runner `lease guard not configured`, und der Tier gilt als verfügbar. Beim
  Start gilt dieselbe Prüfung für die erste Wahl: ein belegter `5070ti` setzt die Direkt-Slots auf 0 und schaltet
  Self ab.
- Ist kein Tier übrig, wird die Partial `paused_owner` (Ereignis `owner_paused`, Sprachfrage an den Eigner).
  Fehlt das Budget vor `cloud`, wird sie `paused_budget` (Ereignis `budget_paused`). `mark` und `dispatch_*`
  fassen pausierte Partials nicht an.
- Frontmatter-Felder der Partial-Datei (das Manifest behält seine Spalten): `harness` (Default `auto`), `track`
  (Hinweis `direct|cloud|self`, erscheint in `plan_status`), `fallback` und `repo` (nur Information für die Bridge).

## Harness je Partial

`harness: auto` lässt den Tier wählen: `5070ti` auf `direct` → In-Process-Direkt-Worker, auf `self` → `opencode`
(`plan-worker-self`), lokaler Tier ohne Track → `pi`, `cloud` → siehe oben. Ein Frontmatter-Wert gilt für diese
Partial, `--harness` für alle. Alle Kindprozesse laufen ohne `GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN` und ohne
die API-Keys fremder Anbieter (nur der eigene Key bleibt: `claude` → `ANTHROPIC_API_KEY`, `agy` → `GEMINI_API_KEY`).

| Harness | Aufruf | Auswertung |
| --- | --- | --- |
| `opencode` | `opencode run --agent <agent> [--model m]` | Ergebniszeile |
| `muse` | wie `opencode` mit `plan-worker-muse` | Ergebniszeile, Pauschale (bucht 0 USD) |
| `pi` | `pi --mode json -p --no-session [--provider P --model M]` | JSON-Events: `agent_end` oder Prozessende schließt ab, ohne beides `no-settle`, `agent_settled` mit `aborted` → `aborted` |
| `claude` | `claude -p --output-format json --model sonnet` | `result` + `total_cost_usd`; `is_error` zählt als Fehlschlag |
| `agy` | `agy -p --output-format json --dangerously-skip-permissions` | `result`, Kosten unbekannt |

Berechtigungen von `claude` kommen aus den Einstellungen des Worktrees (`.claude/settings.json`), der Runner setzt
keinen Permission-Modus. Bei allen Harnesses entscheidet die Zeile `PLAN-RUNNER-RESULT:` über Erfolg und Misserfolg.

## Budget

`state.json` führt `ledger: {budgetUsd, spentUsd, flatRateCalls, calls: []}` und je Partial `history: [{tier, harness,
ok, ms, costUsd}]`. Gebucht werden die vom Harness gemeldeten Kosten (`claude`: `total_cost_usd`, auch bei
Fehlschlägen). Pauschal abgerechnete Harnesses (Muse) buchen 0 USD und zählen in `flatRateCalls`, lokale Läufe buchen
0. Ein Lauf mit Cloud-Tier oder Cloud-Harness (`muse`, `claude`, `agy`) startet nur, solange `spentUsd < budgetUsd`.
Sonst wird die Partial `paused_budget`; lokale Partials laufen weiter. Das Budget gilt je Goal über Neustarts hinweg:
Beim Fortsetzen mit höherem `--budget-usd` werden `paused_budget`-Partials wieder `open`. `paused_owner` beginnt
beim Neustart mit frischer Kette (der Neustart ist die Antwort des Eigners).

## Ereignisse

`events.jsonl` enthält eine JSON-Zeile je Ereignis und wird bei Neustarts fortgeschrieben:
`{"ts","type","partial","tier","harness","costUsd","spentUsd","detail"}` (fehlende Werte `null`).
`type` ist `partial_started`, `partial_done`, `partial_failed`, `escalated`, `budget_paused`, `owner_paused` oder
`run_done`. `escalated` nennt den neuen Tier und im `detail` den Grund. `partial_done` und `partial_failed` entstehen
beim `mark` des Orchestrators, `run_done` beim Ende des Laufs (`detail` mit Zählern und Exit-Code). Schreibfehler
stoppen den Lauf nicht.

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

Fortschritt, Budget-Ledger und Orchestrator-Notizen liegen in `.agents/plans/<slug>/.plan-runner/state.json`. Die
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
`test_plan_runner_direct_worker.py` den Direkt-Worker gegen einen Fake-OpenAI-Server und
`test_plan_runner_tiers.py` Fallback-Kette, Harness, Budget und Ereignisse mit Stubs für `opencode`, `claude`, `pi` und
den Lease-Guard (keine GPU und keine echten Modelle nötig):

```bash
bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner.py tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_direct_worker.py tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_tiers.py
```
