---
title: dev-flow-plan und dev-flow-execute ohne Ticket-DB (Plan-Quelle per Branch-Konvention)
ticket_id: none
domains: [dev-flow, plan-authoring, agent-skills, scripts]
status: planning
---
# ticketless-dev-flow — Implementation Plan

Spec: `docs/superpowers/specs/2026-10-15-ticketless-dev-flow-design.md` (D1–D7, F1–F5). `ticket_id: none`, weil die Ticket-DB entfernt ist (#6696).

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/plan-preflight.sh` | 107 | 693 |
| `scripts/llm/plan-runner.mjs` | 563 | 237 |
| `tests/py/spec/native_ported/spec/dev-flow-plan/test_plan_preflight.py` | 129 | 671 |
| `tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py` | 259 | 541 |

Ohne S1-Grenze (Markdown/YAML): `.opencode/skills/dev-flow-plan/SKILL.md` (274), `.opencode/skills/references/dev-flow-plan-phases.md` (376), `.opencode/skills/dev-flow-execute/SKILL.md` (279), `.opencode/skills/references/dev-flow-execute-phases.md` (366).

- `scripts/plan-preflight.sh`: D1. Nur `pre-commit`, kein `--ticket`, Lock ausschließlich `branch__<slug>.json`; `--ticket` und `pre-worktree` → Exit 2 (F5).
- `scripts/llm/plan-runner.mjs`: D3. `--branch <b>` statt `--ticket`; `resolveTicketRef`, `materializeDbPlan`, `dbPlanBody` entfernen; `--ticket` → Exit 2 (F5). Datei schrumpft.
- `.opencode/skills/dev-flow-plan/SKILL.md`, `.opencode/skills/dev-flow-plan/references/feature-path-guards.md`, `.opencode/skills/dev-flow-plan/references/plan-batch-status.md`, `.opencode/skills/references/dev-flow-plan-phases.md`: D4.
- `.opencode/skills/dev-flow-execute/SKILL.md`, `.opencode/skills/references/dev-flow-execute-phases.md`: D5. `.opencode/skills/dev-flow-execute/references/phase-events.md` wird gelöscht.
- `.opencode/skills/references/ticket-stage-procedure.md` wird gelöscht (D6). Verweise anpassen in `.opencode/skills/references/SKILL.md`, `.opencode/skills/references/dev-flow-gotchas.md`, `.opencode/skills/references/resume-contract.md`, `.opencode/skills/references/session-coordination.md`, `.opencode/skills/references/mcp-tool-guide.md`, `docs/agent-guide/registry/plan-guards.yaml`, `tests/fixtures/os-retirement/skills.txt`.
- Tests: `tests/py/spec/native_ported/spec/dev-flow-plan/test_plan_preflight.py`, `tests/py/spec/native_ported/spec/dev-flow-plan/test_plan_preflight_staged_set.py`, `tests/py/spec/native_ported/spec/dev-flow-plan/test_plan_preflight_repo_index_hint.py`, `tests/py/spec/native_ported/spec/test_dev_flow_plan.py`, `tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py`; neu `tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_branch_ref.py`, gelöscht `tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_ticket_ref.py`.

S1: `.sh`/`.mjs`/`.py` Limit 800, keine der Dateien ist gebaselined (`jq '."S1:<pfad>"' docs/code-quality/baseline.json` → null). S2 keine neuen Importe. S3 keine Hostnamen. S4 keine neuen Skripte.

Abweichung von der Spec: `dev-flow-plan/test_stage_plan_contract.py` bleibt bestehen. Er prüft `scripts/vda/ticket/stage-plan.sh` selbst, und die Ticket-Skripte sind außer Scope. Dasselbe gilt für die Asserts in `test_dev_flow_plan.py`, die nur `stage-plan.sh` und `ticket.sh release-hold` prüfen.

## Partials

| id | file | role | target_files | depends_on |
| --- | --- | --- | --- | --- |
| p1 | tasks.md | tests | tests/py/spec/native_ported/spec/dev-flow-plan/test_plan_preflight.py, tests/py/spec/native_ported/spec/dev-flow-plan/test_plan_preflight_staged_set.py, tests/py/spec/native_ported/spec/dev-flow-plan/test_plan_preflight_repo_index_hint.py, tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_branch_ref.py, tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_ticket_ref.py | |
| p2 | tasks.md | impl | scripts/plan-preflight.sh, scripts/llm/plan-runner.mjs | p1 |
| p3 | tasks.md | impl | .opencode/skills/dev-flow-plan/SKILL.md, .opencode/skills/dev-flow-plan/references/feature-path-guards.md, .opencode/skills/dev-flow-plan/references/plan-batch-status.md, .opencode/skills/references/dev-flow-plan-phases.md | p2 |
| p4 | tasks.md | impl | .opencode/skills/dev-flow-execute/SKILL.md, .opencode/skills/references/dev-flow-execute-phases.md, .opencode/skills/dev-flow-execute/references/phase-events.md | p2 |
| p5 | tasks.md | impl | .opencode/skills/references/ticket-stage-procedure.md, .opencode/skills/references/SKILL.md, .opencode/skills/references/dev-flow-gotchas.md, .opencode/skills/references/resume-contract.md, .opencode/skills/references/session-coordination.md, .opencode/skills/references/mcp-tool-guide.md, docs/agent-guide/registry/plan-guards.yaml, tests/fixtures/os-retirement/skills.txt, tests/py/spec/native_ported/spec/test_dev_flow_plan.py | p3, p4 |
| p6 | tasks.md | tests | tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py | |

Reihenfolge: Task 1 (p1, rot) → Task 2 (p2, grün) → Task 3 (p3) und Task 4 (p4) parallel → Task 5 (p5) → Task 6 (p6 + dotfiles-Begleit-PR) → Task 7 Verify.

## Task 1: RED-Tests für Preflight und plan-runner (p1)

`test_plan_preflight.py`, `test_plan_preflight_staged_set.py`, `test_plan_preflight_repo_index_hint.py`:
- Jeder Aufruf `pre-commit --ticket T…` wird zu `pre-commit` ohne Argumente. Lock-Fixtures heißen nur noch `branch__<slug>.json`; Fixtures mit `ticket__*.json` entfallen.
- Neu: kein Branch-Lock → rc 1, stderr enthält `agent-lock.sh claim branch` (F4).
- Neu: Lock mit anderem `branch` → rc 1, stderr enthält `Branch-Mismatch` (F4).
- Neu: `pre-commit --ticket T123456` → rc 2, stderr enthält `entfernt` (F5).
- Neu: `pre-worktree` → rc 2, stderr enthält `entfernt` (F5).
- Erfolgsfall: stdout `plan-preflight pre-commit: OK (branch=<b>, lock=branch__<slug>.json)` ohne `ticket=`.

`test_plan_runner_branch_ref.py` (neu, Fixture-Aufbau aus `test_plan_runner_ticket_ref.py` übernehmen, danach diese Datei löschen):
- Git-Fixture mit Worktree auf Branch `feature/demo` und `.agents/plans/demo/tasks.md`; `plan-runner.mjs --branch feature/demo --print-slots` (oder kleinster vorhandener Lauf ohne Worker) löst `changeDir` auf `<wt>/.agents/plans/demo` auf.
- `--branch feature/demo --worktree <pfad>` nutzt den Override.
- `--branch feature/fehlt` → rc 2, stderr nennt `not checked out` und `--worktree` (F3).
- `--branch feature/demo` mit positionalem `<change-dir>` → rc 2.
- `--ticket T901015` → rc 2, stderr enthält `removed` und `--branch` (F5).

```bash
PYTEST_LOCAL=1 PYTEST_JOBS=0 bash scripts/pytest-run.sh -q tests/py/spec/native_ported/spec/dev-flow-plan/test_plan_preflight.py tests/py/spec/native_ported/spec/dev-flow-plan/test_plan_preflight_staged_set.py tests/py/spec/native_ported/spec/dev-flow-plan/test_plan_preflight_repo_index_hint.py tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_branch_ref.py
```
expected: FAIL (Skripte verlangen noch `--ticket` bzw. kennen `--branch` nicht).

Commit: `test(scripts): plan-preflight und plan-runner ohne Ticket (rot)`.

## Task 2: Skripte umstellen (p2)

`scripts/plan-preflight.sh`:
- Usage `plan-preflight.sh pre-commit`. Argumentschleife: `--ticket` → `envfail "--ticket ist entfernt (Ticket-DB abgeschaltet) — Abhilfe: plan-preflight.sh pre-commit ohne Argumente"`; anderes Argument → `usage`.
- `pre-worktree` → `envfail "pre-worktree ist entfernt (check-merged braucht Ticket-IDs) — kein Ersatz noetig, worktree-create.sh checkt vorhandene Branches aus"`.
- `cmd_pre_commit`: `lock_file="$lock_dir/branch__${slug}.json"` ohne ticket-Fallback; Abhilfe-Texte `bash scripts/agent-lock.sh claim branch $branch --label dev-flow-plan --worktree .`; OK-Zeile ohne `ticket=`.
- Kopfkommentar: Verwendung und Herkunft (T001268, T003102, T005114) aktualisieren, T002279-Abschnitt entfernen.

`scripts/llm/plan-runner.mjs`:
- Option `--branch <b>` → `opts.branch`. `--ticket` → `fail(2, '--ticket was removed (ticket DB is gone): use --branch <feature|fix/slug>')`.
- `resolveBranchRef(opts)`: Worktree über `git worktree list --porcelain` (bestehende Schleife aus `resolveTicketRef` übernehmen) oder `opts.worktree`; `slug = branch.replace(/^(feature|fix)\//, '')`; `changeDir = join(worktree, '.agents', 'plans', slug)`. Kein Worktree → `fail(2, "--branch <b>: branch is not checked out in any worktree (git worktree list); pass --worktree <path>")`.
- `resolveTicketRef`, `dbPlanBody`, `materializeDbPlan` löschen; `loadPlan` ruft keinen DB-Fallback mehr. Kopfkommentar Zeile 16 auf `--branch` umstellen.

```bash
PYTEST_LOCAL=1 PYTEST_JOBS=0 bash scripts/pytest-run.sh -q tests/py/spec/native_ported/spec/dev-flow-plan/ tests/py/spec/native_ported/spec/llm-local-dev/
```
expected: PASS.

## Task 3: dev-flow-plan-Prosa (p3)

In `.opencode/skills/dev-flow-plan/SKILL.md`, `references/feature-path-guards.md`, `references/plan-batch-status.md`, `.opencode/skills/references/dev-flow-plan-phases.md`:
- Streichen: Schritt −3-Ticketteil (`ticket.sh grill`), Preflight `check-merged`/`pre-worktree`, Schritt 4.5 (Ticket anlegen/claimen), `stage-plan`-Block, Embedding, `TICKET_EXT_ID`, „Ticket status = plan_staged“, „liest Plan aus DB“, Verweise auf `ticket-stage-procedure.md`.
- Neu Schritt 4.5: `bash scripts/agent-lock.sh claim branch "$(git -C "$WT" branch --show-current)" --worktree "$WT" --label dev-flow-plan`.
- Schritt 5: `bash scripts/plan-preflight.sh pre-commit`, Commit `chore(plans): stage <slug> for execution`, Push, STOPP. Hinweis auf `plan_stage` ohne `ticket`.
- Übergabe-Zustand: Branch gepusht, Plan unter `.agents/plans/<slug>/tasks.md` auf dem Branch, Branch-Claim aktiv, kein PR. „dev-flow-execute leitet den Plan-Pfad aus dem Branch-Namen ab.“
- Fix-Pfad: Ticket-Pflicht und `[$TICKET_EXT_ID]` in Commit-Messages entfernen; failing Test bleibt Pflicht.
- Guard-Anker aus `plan-guards.yaml` (`T001268`, `T003102`, `T005114`, `plan-preflight.sh`) bleiben im Text; `T002279` entfällt mit Task 5.

```bash
git grep -n -E 'ticket\.sh|TICKET_EXT_ID|stage-plan|check-merged|pre-worktree|FACTORY-PLAN-REF|ticket-stage-procedure' -- .opencode/skills/dev-flow-plan .opencode/skills/references/dev-flow-plan-phases.md
```
Erwartet: keine Treffer.

## Task 4: dev-flow-execute-Prosa (p4)

In `.opencode/skills/dev-flow-execute/SKILL.md` und `.opencode/skills/references/dev-flow-execute-phases.md`:
- Schritt 1 „Plan-Pfad laden“: `BRANCH=$(git -C "$WT" branch --show-current)`; nur `feature/*`/`fix/*`, sonst Abbruch „kein Plan-Branch“ (F1); `SLUG=${BRANCH#*/}`; `git -C "$WT" cat-file -e "HEAD:.agents/plans/$SLUG/tasks.md"` oder Abbruch mit Pfad (F2). Der Satz „Der Plan-Pfad kommt aus der Datenbank, nie aus einem Glob“ wird zu „kommt aus dem Branch-Namen, nie aus einem Glob“.
- Streichen: `release-hold`, `assert-phase-chain` (beide Stellen), Phase-Event-Aufrufe, `verify:done`-Event, Archivierung nach `tickets.ticket_plans`, `ticket.sh grill`, Ticket-Statuswechsel.
- Verify-Gate bleibt: `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
- `plan-runner.mjs --ticket` → `plan-runner.mjs --branch "$BRANCH"`.
- `.opencode/skills/dev-flow-execute/references/phase-events.md` löschen, Verweise entfernen.

```bash
git grep -n -E 'ticket\.sh|TICKET_ID|release-hold|assert-phase-chain|record_phase_event|FACTORY-PLAN-REF|ticket_plans|phase-events\.md|--ticket' -- .opencode/skills/dev-flow-execute .opencode/skills/references/dev-flow-execute-phases.md
```
Erwartet: keine Treffer.

## Task 5: Referenzen, Registry, Prosa-Tests (p5)

- `.opencode/skills/references/ticket-stage-procedure.md` löschen; Zeile in `.opencode/skills/references/SKILL.md` entfernen.
- `dev-flow-gotchas.md`, `resume-contract.md`, `session-coordination.md`, `mcp-tool-guide.md`: Stellen, die den Plan-/Execute-Ablauf über Ticket-DB beschreiben, auf den Branch-Vertrag umstellen oder streichen. Einträge, die nur Ticket-Skills betreffen, bleiben.
- `docs/agent-guide/registry/plan-guards.yaml`: Guard `T002279` entfernen; `applies_to`-Einträge auf `ticket-stage-procedure.md` entfernen; Guard `plan-preflight` Titel auf „Pre-Commit-Guards laufen über scripts/plan-preflight.sh“.
- `tests/fixtures/os-retirement/skills.txt`: Zeile mit `ticket-stage-procedure` entfernen (Fixture listet existierende Skill-Dateien).
- `tests/py/spec/native_ported/spec/test_dev_flow_plan.py`: `test_t002272_m1_dev_flow_plan_skill_md_and_ticket_stage_procedure_md_reference_stage_plan_hold` löschen; Tests zu `stage-plan.sh --hold` und `ticket.sh release-hold` bleiben. Neu: `dev-flow-plan/SKILL.md` enthält `claim branch` und `plan-preflight.sh pre-commit` und kein `stage-plan`.

```bash
git grep -n -E 'ticket-stage-procedure|phase-events\.md' -- . ':!docs/superpowers/specs' ':!docs/code-quality/repo-index.json'
PYTEST_LOCAL=1 PYTEST_JOBS=0 bash scripts/pytest-run.sh -q tests/py/spec/native_ported/spec/test_dev_flow_plan.py tests/py/spec/native_ported/spec/dev-flow-plan/test_guard_parity.py tests/py/spec/native_ported/spec/test_dev_flow_execute.py tests/py/spec/native_ported/spec/agent-skills/test_dev_flow_lifecycle_contract.py
```
Erwartet: keine `git grep`-Treffer, pytest PASS. `docs/code-quality/repo-index.json` regeneriert Task 7.

## Task 6: devflow-mcp `plan_stage` (p6 + dotfiles-Begleit-PR)

Dotfiles (`~/mcp-servers/devflow`, eigener Worktree unter `~/.worktrees/dotfiles/<branch>`, eigener PR, vor diesem PR mergen):
- `lib/plan-stage.mjs`: Parameter `ticket` und `partials` entfernen; Claim `agent-lock.sh claim branch <branch> --worktree <wt> --label dev-flow-plan`; Preflight `plan-preflight.sh pre-commit`; Commit `chore(plans): stage <slug> for execution`; Schritt `stage` (`ticket.sh stage-plan`) entfernen.
- `server.mjs`: Tool-Schema ohne `ticket`/`partials`, Beschreibung ohne Ticket-Claim und `stage-plan`.

Bachelorprojekt `tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py`:
- Aufruf ohne `"ticket"`; `ticket.sh`-Stub entfernen; Erwartete Aufrufreihenfolge `worktree-create.sh agent-lock.sh plan-lint.sh plan-preflight.sh` ohne `ticket.sh`; `agent-lock.sh`-Aufruf enthält `claim branch`.

```bash
PYTEST_LOCAL=1 PYTEST_JOBS=0 bash scripts/pytest-run.sh -q tests/py/spec/native_ported/spec/devflow-mcp/test_plan_stage.py
```
expected: FAIL gegen den alten `plan-stage.mjs`, PASS nach dem dotfiles-Merge (Test liest `MCP_SERVERS_HOME`, Default `~/mcp-servers`).

## Task 7: Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/plan-lint.sh .agents/plans/ticketless-dev-flow/tasks.md
```
Erwartet: alles grün. Danach Plan-Ordner gemäß Lifecycle löschen und PR öffnen.
