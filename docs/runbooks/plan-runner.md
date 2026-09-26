# Runbook: plan-runner (OpenSpec-Partials mit lokalen Modellen)

`scripts/llm/plan-runner.mjs` führt die Partials eines OpenSpec-Changes aus (T900504). Der
Orchestrator (Qwen3.8-27B GSQ-RCO IQ2_S-mtp, RTX 5070 Ti, `:1919`) steuert per Tool-Loop. Die Partials
laufen als `opencode run --agent qwen35-mtp` auf dem 4B-Worker (Qwen3.5-4B, RTX 3060 Ti, `:1920`).
Sind alle 4B-Slots belegt, darf der Orchestrator eine Partial selbst ausführen
(`opencode run --agent local`). Während dieses Selbstaufrufs vergibt der Scheduler frei werdende
4B-Slots selbst und meldet die Ergebnisse, sobald der Orchestrator zurückkehrt.

Module: `scripts/llm/plan-runner/plan.mjs` (Manifest, Abhängigkeiten, Zustand, Worker-Prompt) und
`scripts/llm/plan-runner/workers.mjs` (opencode-Prozesse, Slot-Verwaltung). Nur Node-Standardbibliothek.

## Voraussetzungen

- `qwen38-gsq-iq2s.service` läuft auf `:1919` mit 1 Slot und `-cram 12288`. `--cache-ram` hält den
  Orchestrator-Kontext im Host-RAM, während der Selbstaufruf den Slot belegt.
- `qwen35-mtp.service` läuft auf `:1920`. Die Slot-Zahl des 4B muss zu `--4b-slots` passen
  (Default 1, entspricht `-np 1`).
- `opencode` ist im `PATH`, und die Agenten `local` und `qwen35-mtp` sind in
  `.opencode/agent-models.jsonc` konfiguriert.
- Der Change hat eine `## Partials`-Tabelle in `tasks.md` (`id | plan | role | target_files | depends_on`)
  und die Partial-Dateien unter `tasks.d/`. Die `target_files` der Partials sind disjunkt, weil 4B-Worker
  und Selbstaufruf gleichzeitig im selben Worktree arbeiten.

## Aufruf

```bash
node scripts/llm/plan-runner.mjs openspec/changes/<slug> [--worktree <pfad>] [--4b-slots N] [--max-turns N] [--timeout-min N]
```

- `--worktree`: Default ist das Git-Toplevel des Change-Ordners.
- `--4b-slots`: gleichzeitige 4B-Worker (Default 1).
- `--max-turns`: Obergrenze der Orchestrator-Antworten (Default 200).
- `--timeout-min`: Timeout je Worker-Lauf (Default 120). Danach wird die Prozessgruppe beendet und der
  Lauf gilt als `failure`.
- Env `PLAN_RUNNER_ORCH_URL` ersetzt `http://127.0.0.1:1919`, `PLAN_RUNNER_ORCH_MODEL` setzt das Feld
  `model` im Request, `PLAN_RUNNER_OPENCODE` ersetzt das `opencode`-Binary (Tests).

Exit-Codes: `0` alle Partials `done`, `1` mindestens eine `failed` oder Lauf abgebrochen (drei Antworten
ohne Tool-Call in Folge, `--max-turns` erreicht, Orchestrator nicht erreichbar), `2` Konfigurationsfehler
(Manifest, Pfade, Zustandsdatei). Die letzte Zeile auf stdout lautet
`PLAN-RUNNER: done=<n>/<gesamt> failed=<n> open=<n> running=<n>`. Das Protokoll steht auf stderr.

## Worker-Vertrag

Jeder Worker bekommt den vollständigen Text seiner Partial, den Worktree-Pfad und die Liste der Dateien,
die er ändern darf. Seine letzte Ergebniszeile muss `PLAN-RUNNER-RESULT: success <Kurzfassung>` oder
`PLAN-RUNNER-RESULT: failure <Grund>` lauten. Fehlt sie oder endet der Prozess mit Exit ≠ 0, gilt der
Lauf als `failure`. Ein Worker-Erfolg setzt die Partial nicht auf `done`. Das tut erst der
Orchestrator mit `mark`, nachdem er das Ergebnis geprüft hat. `mark(id, "open")` erlaubt zwei
Wiederholungen, danach wird die Partial `failed`.

## Zustandsdatei und Resume

Fortschritt und Orchestrator-Notizen liegen in `openspec/changes/<slug>/.plan-runner/state.json`. Die
Datei wird nach jedem Tool-Aufruf atomar geschrieben (Temp-Datei, dann `rename`).

Nach einem Abbruch (Ctrl-C, Absturz, Timeout) denselben Befehl erneut starten. Partials mit `done` oder
`failed` bleiben unverändert. Partials mit `running` werden auf `open` zurückgesetzt und neu vergeben. Die
Notizen aus dem letzten `execute_self` gehen als Kontext an den Orchestrator. Einen kompletten Neustart
erzwingt `rm -r openspec/changes/<slug>/.plan-runner`.

## Messgrundlage

`scripts/llm/measurements/2026-09-26-qwen38-gsq-iq2s-mtp.md` (Branch
`chore/llm-bench-orchestration-T900480`): Ein vom Selbstaufruf verdrängter 51k-Token-Orchestrator-Slot
kehrt mit `--cache-ram` in 2,9 s zurück (26 Token neu), kalt in 48 s. Explizites Slot-Save/Restore
erzwingt bei diesem Hybridmodell trotzdem ein volles Neu-Prefill und wird deshalb nicht verwendet.

## Tests

`tests/spec/llm-local-dev/plan-runner.bats` prüft die Szenarien der Spec gegen einen Fake-Orchestrator
und einen opencode-Stub (keine GPU nötig):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/plan-runner.bats
```
