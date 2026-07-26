# Plan: p1-update-dev-flow-plan

## Goal
Update `opencode-flow-plan` skill documentation to address Mishap 1 (Spec-Delta) and Mishap 2 (Lavish-Board).

## Implementation
1. Open `.opencode/skills/opencode-flow-plan/SKILL.md`.
2. Find the "Fix-Pfad" section, Step 2.8.
3. Add the following text:
   "Hinweis: Erstelle zusätzlich zu design.md auch `openspec/changes/<slug>/specs/<parent-ssot-slug>.md` nach der T001304-Delta-Konvention."
4. Find the "Lavish-Board" mentions in Step A.3 and Step 2.7.
5. Replace "PFLICHT" with "empfohlenes Werkzeug".
6. Add a note about the consent gate and availability in `opencode.jsonc`.
