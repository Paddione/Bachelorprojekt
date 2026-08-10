# Proposal: cross-harness-plan-guardrails

## Why

Der Planungs-Flow (Plan erstellen, Ticket stagen) existiert dreimal getrennt als
Skill-Prosa — `dev-flow-plan` (Claude Code), `opencode-flow-plan` (opencode; agy behandelt
den opencode-Pfad als maßgeblich) — plus ein vierter headless Pfad in der Factory
(`scripts/factory/pipeline.mjs` `plan:decompose`). Gepflegt wird nur der Claude-Pfad: ein
Audit (2026-08-10) fand ~16 Guard-Drift-Punkte im opencode/agy-Pfad, darunter zwei mit
realem Schadenspotential:

- Der opencode-**Fix-Pfad staged vor dem Commit** — exakt die T002673-Klasse:
  `stage-plan.sh` liest den Plan per `git cat-file -p "${branch}:${plan}"` aus dem
  Branch-Commit, findet das propose-Skeleton und lässt `touched_files` bei stillem
  Erfolg leer.
- Der opencode-**Feature-Loop staged ohne `--hold`** — die Factory kann dispatchen,
  bevor der Operator die Ausführung freigegeben hat.

Der einzige Parity-Guard (`tests/spec/harness-workflow-split.bats`) prüft nur
Skill-Existenz und Token-Abwesenheit, nie Guard-Inhalte — deshalb konnte die Drift
unbemerkt wachsen. Schwächere Modelle (DeepSeek-Orchestrator, `gemma26-factory`) lernen
die Plan-Hard-Rules heute erst vom roten Linter statt vor dem Schreiben.

## What

Durchsetzbare Prozess-Guards wandern aus Markdown in gemeinsame fail-closed Skripte, die
jede Runtime identisch aufruft; ein deklarativer Parity-Guard verhindert künftige
Prosa-Drift. Sechs Komponenten (Details: `design.md` im selben Ordner):

1. **`scripts/plan-preflight.sh`** (neu): `pre-commit` (nicht-main, clean tree,
   Lock-Match ticket- ODER branch-scoped, T003102) und `pre-worktree`
   (check-merged-Wrapper, T002279) als fail-closed Subkommandos.
2. **`stage-plan.sh`-Härtung**: `--hold`/`--no-hold` wird Pflicht (Exit 1 wenn beides
   fehlt); leere `touched_files`-Ableitung wird harter Fehler (T002673) mit Override
   `--allow-empty-touched`. Call-Sites werden auf explizite Flags umgestellt
   (`mishap-rollup.sh`, `auto-chore-plan.sh`, `batch-workflow-gen.sh`, Go-MCP-Wrapper
   `workflow.go`).
3. **`plan-lint.sh --rules`** (neu): Hard Rules als kanonische Prompt-Prosa aus dem
   Linter selbst; injiziert in Claude-Plan-Subagent, opencode-Orchestrator und
   `pipeline.mjs plan:decompose`.
4. **Parity-Guard**: `docs/agent-guide/registry/plan-guards.yaml` (Guard-Katalog mit
   Ankern + `applies_to`) und `tests/spec/dev-flow-plan/guard-parity.bats` (fail-closed,
   inkl. Stale-Modell-Check gegen `loadouts.json`/`agent-models.jsonc`).
5. **Einmaliger Prosa-Sync** von `opencode-flow-plan` (~16 Audit-Drift-Punkte) + Umbau
   beider Flow-Skills auf `plan-preflight.sh`-Aufrufe statt Inline-Snippets.
6. **OpenSpec-Delta** auf `openspec/specs/dev-flow-plan.md`: Symmetrie-Klausel um
   Guard-Parity + Preflight erweitern; toten `.agents/skills/`-Pfad korrigieren.

Vorentscheidungen (User, 2026-08-10): Ansatz Skripte + Parity-Guard (kein
Prosa-Generator); Scope alle Runtimes inkl. Factory; beide Vertragsänderungen an
`stage-plan` bestätigt.

_Ticket: T003267_
