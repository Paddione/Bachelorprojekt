---
title: "skill-quality-pass — Implementation Plan"
ticket_id: T002303
domains: [agent-config, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# skill-quality-pass — Implementation Plan

_Ticket: T002303_

Qualitäts-Pass über die 20 projekteigenen Skills plus die maschinelle Verankerung des Ergebnisses.
Spec: `openspec/changes/skill-quality-pass/design.md` ·
Intel: `openspec/changes/skill-quality-pass/intel.json`

## File Structure

| Datei | Änderung |
|---|---|
| `.claude/skills/OVERVIEW.md` | Vendor-Sektion vervollständigen (SSOT für den Projekt/Vendor-Schnitt), 5 tote Einträge entfernen, Links auf Quelldateien |
| `.claude/skills/brain-ingest/SKILL.md` | Frontmatter erstmals anlegen |
| `.claude/skills/dev-flow-chore/SKILL.md` | description schärfen |
| `.claude/skills/dev-flow-e2e/SKILL.md` | description schärfen |
| `.claude/skills/references/SKILL.md` | description schärfen |
| `.claude/skills/repo-hygiene/SKILL.md` | description gegen `ticket-ops` abgrenzen |
| `.claude/skills/incident-response/SKILL.md` | description schärfen |
| `.claude/skills/operations-management/SKILL.md` | description schärfen |
| `.claude/skills/mishap-tracker/SKILL.md` | description schärfen |
| `.claude/skills/openspec-propose/SKILL.md` | Fork-Deklaration statt Upstream-Metadata |
| `.claude/skills/openspec-apply-change/SKILL.md` | Fork-Deklaration statt Upstream-Metadata |
| `.claude/skills/openspec-archive-change/SKILL.md` | Fork-Deklaration statt Upstream-Metadata |
| `.claude/skills/database-specialist/SKILL.md` | `category:` entfernen, description schärfen |
| `.claude/skills/security-specialist/SKILL.md` | `category:` entfernen, description schärfen |
| `.claude/skills/website-specialist/SKILL.md` | `category:` entfernen, description schärfen |
| `.claude/skills/dev-flow-execute/SKILL.md` | 486 Zeilen → höchstens 250, extract nach `references/` |
| `.claude/skills/infra-ops/SKILL.md` | 476 Zeilen → höchstens 250, extract nach `references/` |
| `.claude/skills/dev-flow-plan/SKILL.md` | 460 Zeilen → höchstens 250, extract nach `references/` |
| `.claude/skills/ticket-ops/SKILL.md` | 334 Zeilen → höchstens 250, extract nach `references/` |
| `.claude/skills/openspec-explore/SKILL.md` | 298 Zeilen → höchstens 250, extract nach `references/`, Fork-Deklaration |
| `.claude/skills/git-workflow/SKILL.md` | 283 Zeilen → höchstens 250, extract nach `references/` |
| `.claude/skills/references/dev-flow-execute-phases.md` | NEU — ausgelagerte Prozedur-Details aus `dev-flow-execute` |
| `.claude/skills/references/dev-flow-plan-phases.md` | NEU — ausgelagerte Prozedur-Details aus `dev-flow-plan` |
| `.claude/skills/references/infra-ops-runbooks.md` | NEU — ausgelagerte Sektions-Runbooks aus `infra-ops` |
| `.claude/skills/references/ticket-ops-procedures.md` | NEU — ausgelagerte Prozedur-Details aus `ticket-ops` |
| `.claude/skills/references/git-workflow-procedures.md` | NEU — ausgelagerte Prozedur-Details aus `git-workflow` |
| `.claude/skills/references/openspec-explore-procedures.md` | NEU — ausgelagerte Prozedur-Details aus `openspec-explore` |
| `scripts/health-goals-check.sh` | `G-AGENTIC09` verschärfen: Schwelle 250, Scope projekteigen, `target` → `gate` |
| `.claude/lib/goals.md` | `G-AGENTIC09`-Eintrag auf die neue Definition und den Ticket-Owner umschreiben |
| `tests/spec/agent-skills.bats` | Tests für description-Präsenz, Zeilenbudget, Vendor-Sektions-Vollständigkeit |
| `tests/spec/agentic-tooling-quality-goals.bats` | Test für die neue `G-AGENTIC09`-Semantik |
| `website/src/data/test-inventory.json` | regeneriert nach Test-Änderungen |

## Partials

| id | Plan | Rolle | target_files | depends_on |
|---|---|---|---|---|
| p1 | `tasks.d/p1-overview-ssot.md` | impl | `.claude/skills/OVERVIEW.md` |  |
| p2 | `tasks.d/p2-frontmatter.md` | impl | `.claude/skills/brain-ingest/SKILL.md`, `.claude/skills/dev-flow-chore/SKILL.md`, `.claude/skills/dev-flow-e2e/SKILL.md`, `.claude/skills/references/SKILL.md`, `.claude/skills/repo-hygiene/SKILL.md`, `.claude/skills/incident-response/SKILL.md`, `.claude/skills/operations-management/SKILL.md`, `.claude/skills/mishap-tracker/SKILL.md`, `.claude/skills/openspec-propose/SKILL.md`, `.claude/skills/openspec-apply-change/SKILL.md`, `.claude/skills/openspec-archive-change/SKILL.md`, `.claude/skills/database-specialist/SKILL.md`, `.claude/skills/security-specialist/SKILL.md`, `.claude/skills/website-specialist/SKILL.md` |  |
| p3 | `tasks.d/p3-progressive-disclosure.md` | impl | `.claude/skills/dev-flow-execute/SKILL.md`, `.claude/skills/infra-ops/SKILL.md`, `.claude/skills/dev-flow-plan/SKILL.md`, `.claude/skills/ticket-ops/SKILL.md`, `.claude/skills/openspec-explore/SKILL.md`, `.claude/skills/git-workflow/SKILL.md`, `.claude/skills/references/dev-flow-execute-phases.md`, `.claude/skills/references/dev-flow-plan-phases.md`, `.claude/skills/references/infra-ops-runbooks.md`, `.claude/skills/references/ticket-ops-procedures.md`, `.claude/skills/references/git-workflow-procedures.md`, `.claude/skills/references/openspec-explore-procedures.md` |  |
| p4 | `tasks.d/p4-gate.md` | impl | `scripts/health-goals-check.sh`, `.claude/lib/goals.md` | p1, p3 |
| p5 | `tasks.d/p5-tests.md` | tests | `tests/spec/agent-skills.bats`, `tests/spec/agentic-tooling-quality-goals.bats`, `website/src/data/test-inventory.json` | p1 |

`p4` hängt an `p1`, weil das verschärfte Gate den Projekt/Vendor-Schnitt aus `OVERVIEW.md` liest,
und an `p3`, weil ein auf 250 verschärftes Gate vor den Kürzungen sofort rot stünde.
`p5` hängt an `p1`, weil die Tests dieselbe Vendor-Sektion parsen.

<!-- vitest: kein neuer Test nötig — der Change berührt keine Datei unter `website/src/lib/**` oder `website/src/pages/api/**`; die Verifikation läuft über BATS und `health-goals-check.sh`. -->

## Task 6 — Verifikation (final)

Nach Abschluss aller Partials im Worktree ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich explizit, weil nicht alle betroffenen Gates in `test:changed` liegen:

```bash
bash scripts/health-goals-check.sh --only=G-AGENTIC06,G-AGENTIC07,G-AGENTIC08,G-AGENTIC09,G-AGENTIC10
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats tests/spec/agentic-tooling-quality-goals.bats
bash scripts/openspec.sh validate
```

**Akzeptanz:**

- `bash scripts/health-goals-check.sh --only=G-AGENTIC06,G-AGENTIC07,G-AGENTIC08,G-AGENTIC09,G-AGENTIC10` endet mit Exit 0.
- Kein projekteigener `SKILL.md` überschreitet 250 Zeilen — nachgewiesen durch den Zählbefehl aus `tasks.d/p4-gate.md`.
- Jeder projekteigene `SKILL.md` ohne `archived: true` trägt ein `description`-Feld.
- `git ls-files -- .claude/skills | grep -c '/SKILL\.md$'` liefert weiterhin `28`, und `OVERVIEW.md` behauptet dieselbe Zahl.
- `task freshness:check` endet mit Exit 0.
