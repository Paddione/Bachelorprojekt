---
ticket: T001829
health_goal: G-AGENTIC09
---

# G-AGENTIC09: dev-flow-plan/SKILL.md 508→<500 Zeilen

## Purpose

Die Datei `.claude/skills/dev-flow-plan/SKILL.md` hat aktuell 508 Zeilen und überschreitet damit die Schwelle von 500 Zeilen. Ziel: Prose komprimieren ohne Inhaltsverlust, um unter 500 Zeilen zu kommen.

## Requirements

### Requirement: Zeilenanzahl unter 500

Die Skill-Datei muss auf <500 Zeilen reduziert werden.

**Scenarios:**

GIVEN die Datei hat 508 Zeilen
WHEN Prose-Komprimierung angewendet wird
THEN hat die Datei <500 Zeilen

### Requirement: Kein Inhaltsverlust

Alle Funktionalitäten, Workflows und Referenzen müssen erhalten bleiben.

**Scenarios:**

GIVEN die komprimierte Datei
WHEN ein Nutzer den Skill liest
THEN fehlen keine Informationen im Vergleich zur Originalversion

## Non-Goals

- Keine Neustrukturierung des Skills
- Keine Änderung an `.opencode/skills/opencode-flow-plan/SKILL.md` (nur Claude-Code-Version)
