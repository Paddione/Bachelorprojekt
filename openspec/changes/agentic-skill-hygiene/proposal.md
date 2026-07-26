# Agentic Skill-Hygiene (G-AGENTIC06/07/08/09)

**Ziel:** 10 Gate-Verletzungen auf 0 senken.

## Violations

| Gate | Count | Problem | Datei(en) |
|------|-------|---------|-----------|
| G-AGENTIC06 | 3 | OVERVIEW.md sagt "36 skills", real sind es 39 | `.claude/skills/OVERVIEW.md` |
| G-AGENTIC07 | 3 | Drei Skills ohne Referenz: gitops-cluster-debug, gitops-knowledge, gitops-repo-audit | `.claude/skills/*/SKILL.md` |
| G-AGENTIC08 | 3 | Drei tote Script-Pfade: scripts/check-deprecated.sh, scripts/discover.sh, scripts/validate.sh | `.claude/skills/*/SKILL.md` |
| G-AGENTIC09 | 1 | dev-flow-plan/SKILL.md ist 523 Zeilen (>500) | `.claude/skills/dev-flow-plan/SKILL.md` |

## Lösungen

1. **AGENTIC06:** Counter in OVERVIEW.md von 36 auf 39 aktualisieren
2. **AGENTIC07:** GitOps-Skills in OVERVIEW.md referenzieren (Section "Infrastructure & Networking")
3. **AGENTIC08:** Tote Script-Pfade in SKILL.md-Dateien korrigieren/entfernen
4. **AGENTIC09:** dev-flow-plan/SKILL.md trimmen (Blöcke extrahieren → file://-Pointer, Target ≤495 Zeilen)
