# Agent Library

Zentrale Bibliothek wiederverwendbarer Fragmente für Agenten-Definitionen und Prompts.
Fragmente werden via Runtime-`Read` eingebunden — kein Build-Schritt nötig.

## Behaviors

Verhaltensregeln für Agent-Definitionen (`.agents/agents/*.md`).
Jeder Agent liest nur die für seine Domäne relevanten Fragmente.

| Fragment | Zweck | Referenziert von |
|---|---|---|
| [`behaviors/never-push-main.md`](behaviors/never-push-main.md) | Kein direkter Push auf main, immer PRs | alle 6 Agenten |
| [`behaviors/inject-plan-context.md`](behaviors/inject-plan-context.md) | plan-context.sh vor Agent-Dispatch injizieren | infra, website, db, test, security |
| [`behaviors/tool-use-safety.md`](behaviors/tool-use-safety.md) | Reversibility-Check vor destruktiven Operationen | infra, db, ops, security |
| [`behaviors/commit-conventions.md`](behaviors/commit-conventions.md) | squash-merge, branch-naming, Co-Authored-By | infra, website, test |

## Prompts

Wiederverwendbare Prompt-Bausteine für Factory-Prompts und LLM-Aufrufe.

| Fragment | Zweck | Referenziert von |
|---|---|---|
| [`prompts/review-lens-format.md`](prompts/review-lens-format.md) | HARD CONSTRAINT Block für Review-Lenses | factory review-prompts |
| [`prompts/diff-analysis-context.md`](prompts/diff-analysis-context.md) | Diff-Scope Boilerplate (nur `+`-Zeilen) | factory lenses |
| [`prompts/review-coordinator.md`](prompts/review-coordinator.md) | Koordinations-Logik Consolidation-Agent | factory coordinator |

## Wachstumsprinzip

1. Neues Fragment schreiben
2. In relevante Agenten-Definitionen eintragen (unter `## Library`)
3. Hier im README verlinken

Wenn ein Behavior in zwei oder mehr Agenten vorkommt: extrahieren, nicht kopieren.

## Agent-zu-Fragment-Mapping

| Agent | Behavior-Fragmente |
|---|---|
| `bachelorprojekt-infra` | never-push-main, inject-plan-context, tool-use-safety, commit-conventions |
| `bachelorprojekt-db` | never-push-main, inject-plan-context, tool-use-safety |
| `bachelorprojekt-website` | never-push-main, inject-plan-context, commit-conventions |
| `bachelorprojekt-ops` | never-push-main, tool-use-safety |
| `bachelorprojekt-test` | never-push-main, inject-plan-context, commit-conventions |
| `bachelorprojekt-security` | never-push-main, tool-use-safety |
