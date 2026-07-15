---
ticket: T001829
health_goal: G-AGENTIC09
---

# Tasks: G-AGENTIC09 Skill Compression

## Task 1: Aktuelle Zeilenanzahl prüfen

**Datei:** `.claude/skills/dev-flow-plan/SKILL.md`

`wc -l` ausführen um Baseline zu bestätigen.

**Verify:**
1. `wc -l .claude/skills/dev-flow-plan/SKILL.md` zeigt 508

## Task 2: Prose-Komprimierung anwenden

**Datei:** `.claude/skills/dev-flow-plan/SKILL.md`

Strategien (in Reihenfolge):
1. **Prose-Entwrapping:** Lange Absätze in kürzere Zeilen umbrechen (kein Inhalt entfernen)
2. **Redundante Leerzeilen:** Doppelte Leerzeilen entfernen
3. **Boilerplate-Auslagerung:** Wiederkehrende Abschnitte (Framework-Mapping, Related Skills) in externe Referenz-Dokumente auslagern

**Verify:**
1. `wc -l .claude/skills/dev-flow-plan/SKILL.md` zeigt <500
2. `diff` zwischen Original und komprimiert zeigt nur Formatierungsänderungen, keine Inhaltsänderungen

## Task 3: Referenz-Dokument anlegen (falls nötig)

**Datei:** `.claude/skills/references/dev-flow-plan-ref.md`

Wenn Boilerplate ausgelagert wird, Referenz-Datei anlegen und in SKILL.md verlinken.

**Verify:**
1. Datei existiert und enthält ausgelagerten Inhalt
2. SKILL.md verlinkt auf die Referenz
