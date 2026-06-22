# Agent Library — Design Spec

**Date:** 2026-06-22
**Status:** approved

## Problem

Behavior-Regeln und Prompt-Snippets sind in der Codebase dreifach verstreut:
- `.claude/agents/*.md` — je nach Agent manuell wiederholt
- `scripts/factory/*.prompt.md` — dupliziertes Output-Schema in jedem Review-Prompt
- `scripts/systemtest-analysis-prompt.md` — standalone, nicht wiederverwendbar

Änderungen an einer gemeinsamen Regel (z.B. "nie direkt auf main pushen") müssen manuell in alle 6 Agenten-Dateien eingepflegt werden — fehleranfällig und schwer zu enforced.

## Ziel

Eine zentrale Library unter `.claude/lib/` die:
1. **Behavior-Blöcke** — wiederverwendbare Verhaltensregeln für Agenten
2. **Prompt-Snippets** — wiederverwendbare Prompt-Bausteine für Factory-Prompts und andere LLM-Aufrufe

enthält, und die von Agenten via **Laufzeit-Includes** (Runtime `Read`-Aufrufe) eingebunden wird.

## Verzeichnisstruktur

```
.claude/lib/
  behaviors/
    never-push-main.md          # Kein direkter Push auf main
    inject-plan-context.md      # plan-context.sh vor Agent-Dispatch injizieren
    tool-use-safety.md          # Reversibility-Check vor destruktiven Operationen
    commit-conventions.md       # squash-merge, branch-naming, Co-Authored-By
  prompts/
    review-lens-format.md       # JSON-Output-Schema für Review-Lenses (factory)
    review-coordinator.md       # Koordinations-Logik für Consolidation-Agent
    diff-analysis-context.md    # Boilerplate "You receive a diff..." für Analysen
  README.md                     # Navigierbarer Index aller Fragmente
```

## Include-Mechanismus

Jede `.claude/agents/*.md`-Datei bekommt einen `## Library`-Abschnitt direkt nach dem Frontmatter. Der Agent liest diese Dateien **zu Beginn jeder Session**, bevor er andere Aufgaben erledigt.

```markdown
---
name: bachelorprojekt-infra
description: >
  Use for Kubernetes manifest work...
---

## Library

At the start of every session, read these library fragments before doing anything else:
- `.claude/lib/behaviors/never-push-main.md`
- `.claude/lib/behaviors/inject-plan-context.md`
- `.claude/lib/behaviors/tool-use-safety.md`
- `.claude/lib/behaviors/commit-conventions.md`

---

You are an infrastructure specialist...
```

Jeder Agent referenziert **nur die für seine Domäne relevanten** Fragmente. Beispiele:

| Agent | Behaviors |
|---|---|
| `bachelorprojekt-infra` | never-push-main, inject-plan-context, tool-use-safety, commit-conventions |
| `bachelorprojekt-db` | never-push-main, tool-use-safety, (ggf. database-safety) |
| `bachelorprojekt-website` | never-push-main, inject-plan-context, commit-conventions |
| `bachelorprojekt-ops` | tool-use-safety (ops-Aktionen sind per se destruktiver) |
| `bachelorprojekt-test` | never-push-main, commit-conventions |
| `bachelorprojekt-security` | never-push-main, tool-use-safety |

## Prompt-Snippets & Migration

Die `scripts/factory/*.prompt.md`-Dateien **bleiben unverändert** (direkt in CI-Pipeline eingebunden). Stattdessen werden die **wiederverwendbaren Teile** als Snippets in `.claude/lib/prompts/` extrahiert — die Factory-Prompts können optional auf diese verweisen oder sie direkt einbetten (per Konvention, kein erzwungener Build-Schritt).

Bestehende Prompts die migriert werden:
- `review-lens-format.md` — JSON-Output-Schema, aktuell in jedem `review-*.prompt.md` dupliziert
- `review-coordinator.md` — Koordinations-Logik aus `review-coordinator.prompt.md`

`systemtest-analysis-prompt.md` bleibt standalone (zu spezifisch für ein Fragment).

## README.md — Index

Das `.claude/lib/README.md` ist der navigierbare Index:

```markdown
# Agent Library

## Behaviors
| Fragment | Zweck | Referenziert von |
|---|---|---|
| `behaviors/never-push-main.md` | Kein direkter Push auf main | alle Agenten |
| `behaviors/inject-plan-context.md` | plan-context.sh vor Agent-Dispatch | infra, website |
| `behaviors/tool-use-safety.md` | Reversibility-Check vor destruktiven Ops | infra, db, ops, security |
| `behaviors/commit-conventions.md` | squash-merge, branch-naming, Co-Authored-By | infra, website, test |

## Prompts
| Fragment | Zweck | Referenziert von |
|---|---|---|
| `prompts/review-lens-format.md` | JSON-Output-Schema für Review-Lenses | factory review-prompts |
| `prompts/review-coordinator.md` | Koordinations-Logik Consolidation-Agent | factory coordinator |
| `prompts/diff-analysis-context.md` | "You receive a diff..." Boilerplate | factory lenses |
```

## Wachstumsprinzip

Die Library wächst **organisch**: wenn ein Behavior in zwei oder mehr Agenten auftaucht, wird es extrahiert. Kein Big-Bang-Refactor. Neue Fragmente werden zuerst geschrieben, dann in die relevanten Agenten-Definitionen eingetragen, dann im README verlinkt.

## Out of Scope

- Automatischer Build-Schritt / Kompilierung (kein Tooling nötig)
- Migration von `claude-code/system-prompt.md` (anderer Kontext: In-App-Assistent, nicht Dev-Tooling)
- Versionierung einzelner Fragmente (git history reicht)
