---
ticket_id: T005565
plan_ref: openspec/changes/devflow-review-gate/tasks.md
status: active
date: 2026-08-14
---

# Design: Review-Gate im Implementer-Auftrag verankern

## Root-Cause

T005307 (PR #4444): Das formale Review-Gate (Schritt 3.8, `requesting-code-review`) wurde übersprungen — der Implementer hat implementiert, verifiziert und direkt Auto-Merge-PR erstellt. Das Gate steht im Orchestrator-Abschnitt des Skills, fehlt aber im **Implementer-Auftrag** (dem Prompt, den der Subagent tatsächlich erhält) — im delegierten Flow (T002365) erstellt der Implementer den PR, daher muss das Gate dort verankert sein.

## Fix

1. Im Auftrag-Block von `.claude/skills/dev-flow-execute/SKILL.md` ein PFLICHT-Bullet ergänzen: vor `gh pr create` die Änderungen via `superpowers:requesting-code-review` unabhängig prüfen lassen, Befunde beheben, erst dann PR + Auto-Merge.
2. Schritt 3.8 um einen Verweis auf das Auftrag-Bullet ergänzen (Orchestrator-Kontrollpunkt bleibt).

## Teststrategie

Doc-Konventionstest `tests/spec/agent-skills/devflow-review-gate.bats` (rot verifiziert): der Auftrag-Abschnitt (awk-Bereich) muss `requesting-code-review` UND `PFLICHT` enthalten — grep-Modus als dokumentierte Ausnahme (T002448-M4), Abschnitt-Scoping nach T003104.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `.claude/skills/dev-flow-execute/SKILL.md` | Auftrag-Bullet + 3.8-Verweis |
| `tests/spec/agent-skills/devflow-review-gate.bats` | neu (rot) |
| `openspec/changes/devflow-review-gate/specs/agent-skills.md` | Delta |
