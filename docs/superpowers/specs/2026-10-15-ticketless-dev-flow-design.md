# Ticketloser dev-flow-plan/dev-flow-execute — Design

Stand: 2026-10-15. Vorgänger: #6696 (Ticket-Pflicht aus dev-flow-chore/git-workflow entfernt).

## Ziel

dev-flow-plan und dev-flow-execute laufen Ende-zu-Ende ohne Ticket-DB. Kein Schritt braucht eine
Ticket-ID oder spricht `scripts/ticket.sh` bzw. `ticket-mcp` an. Die bestehenden pytest-Specs zu den
geänderten Verträgen sind angepasst und grün.

Ausgangslage: Die Ticket-DB ist entfernt. `ticket.sh create` scheitert am Identity-Guard (T015168),
`devmesh`/`website` hat kein `tickets`-Schema mehr. Plan und Execute hängen heute an der DB über
`stage-plan`/`FACTORY-PLAN-REF`, `claim ticket`, `check-merged`, `release-hold`,
`assert-phase-chain`, Phase-Events und die Archivierung nach `tickets.ticket_plans`.

## Entscheidungen

- **Plan-Quelle (Konvention):** Branch `feature/<slug>` oder `fix/<slug>` ⇔ Plan
  `.agents/plans/<slug>/tasks.md` auf diesem Branch. `<slug>` = Branch-Name ohne Typ-Präfix.
  Kein neuer Zustand, kein Verweis-Artefakt.
- **Zustand/Telemetrie ersatzlos streichen:** Hold/Release entfällt (gepushter Branch ohne PR ist der
  Hold, PR öffnet erst execute). Phase-Events und `assert-phase-chain` entfallen; das Verify-Gate bleibt
  als realer Lauf (`task test:changed`, `task freshness:check`). Archiv ist die Git-Historie.
- **devflow-mcp `plan_stage` mitziehen** (dotfiles-Repo, `~/mcp-servers/devflow`), eigener PR.

## Komponenten

| ID | Einheit | Neuer Vertrag |
|---|---|---|
| D1 | `scripts/plan-preflight.sh` | Nur `pre-commit`, ohne `--ticket`. Lock-Check ausschließlich `agent-locks/branch__<branch mit / → ->.json`, Feld `branch` muss `HEAD` entsprechen. Abhilfe-Text: `bash scripts/agent-lock.sh claim branch <branch> --label dev-flow-plan`. Staged-Set-Pflicht (T005114) und Nicht-main-Check unverändert. `pre-worktree` entfällt. |
| D2 | `agent-lock.sh check-merged` | Aus dem Plan-Ablauf entfernt; der Subbefehl selbst bleibt bestehen (Ticket-Skripte sind außer Scope). Ein Branch-Äquivalent entfällt bewusst: nach Squash-Merge ist der Branch kein Vorfahre von `main` und wird gelöscht. Doppelarbeit verhindert `worktree-create.sh` (checkt vorhandenen Branch aus). |
| D3 | `scripts/llm/plan-runner.mjs` | `--ticket` → `--branch <b>`: Branch über `git worktree list --porcelain` auf Worktree abbilden, `changeDir = <wt>/.agents/plans/<slug>`. `resolveTicketRef`, `materializeDbPlan`, `dbPlanBody` und die Seams `PLAN_RUNNER_TICKET_JSON`/`PLAN_RUNNER_PLAN_BODY` entfallen. `--worktree` bleibt als Override. Positionaler `<change-dir>`-Modus unverändert. |
| D4 | dev-flow-plan: `SKILL.md`, `references/feature-path-guards.md`, `references/dev-flow-plan-phases.md`, `references/plan-batch-status.md` | Gestrichen: Ticket-Anlage, `claim ticket`, `check-merged`/`pre-worktree`, `stage-plan`, Embedding, `ticket.sh grill`. Feature-Pfad: Worktree → `claim branch` → Plan → `plan-lint` → `plan-preflight.sh pre-commit` → Commit `chore(plans): stage <slug>` → Push → STOPP. Fix-Pfad identisch, failing Test bleibt Pflicht, Commit `chore(plans): add failing test + stage plan`. |
| D5 | dev-flow-execute: `SKILL.md`, `references/dev-flow-execute-phases.md`, `references/phase-events.md` | Schritt 1 leitet den Plan-Pfad aus `git branch --show-current` ab und prüft `git cat-file -e HEAD:.agents/plans/<slug>/tasks.md`. Gestrichen: `release-hold`, `assert-phase-chain`, Phase-Events (`phase-events.md` wird gelöscht), Archivierung nach `tickets.ticket_plans`. Verify-Gate bleibt. |
| D6 | `references/ticket-stage-procedure.md` | Gelöscht; Verweise in Skills, `references/SKILL.md`, `dev-flow-gotchas.md`, `resume-contract.md`, `session-coordination.md`, `mcp-tool-guide.md` und `docs/agent-guide/registry/*` umgehängt oder entfernt. |
| D7 | dotfiles `~/mcp-servers/devflow/lib/plan-stage.mjs`, `server.mjs` | Parameter `ticket` und `partials` entfallen, Schritt `stage` entfällt. Claim `agent-lock.sh claim branch <branch>`, Preflight `plan-preflight.sh pre-commit` ohne `--ticket`. Tool-Beschreibung angepasst. |

## Fehlerfälle

Fail-closed, eine Zeile mit Abhilfe. Exit 1 = Guard verletzt, 2 = Usage/Umgebung.

| ID | Fall | Verhalten |
|---|---|---|
| F1 | execute auf `main`, detached HEAD oder Branch ohne `feature/`/`fix/`-Präfix | Abbruch „kein Plan-Branch“, Abhilfe: in den Worktree des Plan-Branches wechseln. |
| F2 | `.agents/plans/<slug>/tasks.md` nicht in `HEAD` | Abbruch mit erwartetem Pfad; kein Glob, kein Ordner-Fallback. |
| F3 | `plan-runner --branch <b>`, kein Worktree hat `<b>` ausgecheckt | Exit 2 mit Hinweis auf `--worktree`. Kein DB-Fallback. |
| F4 | `plan-preflight pre-commit` ohne `branch__<slug>.json` oder mit abweichendem `branch` | Exit 1, Abhilfe `agent-lock.sh claim branch <branch> --label dev-flow-plan`. |
| F5 | Entfernte Flags/Subbefehle: `plan-preflight --ticket`, `plan-preflight pre-worktree`, `plan-runner --ticket` | Exit 2 „entfernt, nutze …“. Nicht still ignorieren. |

## Tests

- `dev-flow-plan/test_plan_preflight.py`, `test_plan_preflight_staged_set.py`,
  `test_plan_preflight_repo_index_hint.py`: Aufruf ohne `--ticket`, nur Branch-Lock; neue Fälle F4, F5.
- `llm-local-dev/test_plan_runner_ticket_ref.py` → ersetzt durch `test_plan_runner_branch_ref.py`
  (Worktree-Auflösung, `--worktree`-Override, F3, F5).
- `devflow-mcp/test_plan_stage.py`: Aufrufreihenfolge ohne `ticket.sh`, Parameter ohne `ticket`.
- Prosa-Specs (`test_dev_flow_plan.py`, `test_dev_flow_execute.py`, `test_dev_flow_lifecycle_contract.py`,
  `dev-flow-plan/test_red_phase_and_handoff_conventions.py`, `test_plan_commit_scope_guard.py` u. a.):
  Erwartungen auf den neuen Ablauf. Specs, die nur noch den gestrichenen Ablauf belegen
  (`dev-flow-plan/test_stage_plan_contract.py`), werden gelöscht.
- Tests des Ticket-Systems selbst (`test_ticket_system.py`, `scripts/vda/ticket/*`) bleiben unberührt.
- Registry (`plan-guards.yaml`, `skills.yaml`) und Freshness-Artefakte nachziehen
  (`task freshness:regenerate`, `task freshness:check`).

## Auslieferung

1. dotfiles-PR (D7) zuerst. Bis zum Merge des Bachelorprojekt-PR scheitert `plan_stage` an F5; heute
   scheitert es bereits an `ticket.sh`, es bricht also nichts zusätzlich.
2. Bachelorprojekt-PR (D1–D6) als Feature über dev-flow-plan/dev-flow-execute.

## Außer Scope

`scripts/ticket.sh`, `scripts/vda/ticket/*`, Ticket-Skills (`ticket-ops`, `ticket-triage`,
`ticket-dispatch`, `mishap-tracker`, `sdlc-autopilot`), `.lavish/kit/daemon/sources/ticket-mcp.ts`,
`devflow-post-merge-finalize.sh`. Deren Entfernung ist ein eigener Chore.
