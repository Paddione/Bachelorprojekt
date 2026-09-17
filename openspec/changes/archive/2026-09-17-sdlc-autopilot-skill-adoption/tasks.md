---
title: "sdlc-autopilot-skill-adoption — Implementation Plan"
ticket_id: T016420
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sdlc-autopilot-skill-adoption — Implementation Plan

_Ticket: T016420_

## File Structure

```
.opencode/skills/sdlc-autopilot/SKILL.md                          # NEU (aus Sicherung, 1:1)
openspec/changes/sdlc-autopilot-skill-adoption/proposal.md        # NEU
openspec/changes/sdlc-autopilot-skill-adoption/specs/agent-skills.md  # NEU (Delta → SSOT agent-skills)
openspec/changes/sdlc-autopilot-skill-adoption/tasks.md           # NEU (diese Datei)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED): ENTFALLT.** Reine Skill-Markdown-Aufnahme
      unter `.opencode/skills/` — `tests/spec/agent-skills.bats` scannt
      ausschließlich `.claude/skills/`, es gibt keine Testsurface für
      opencode-only Skills (Ticket-Begründung siehe proposal.md §What).
      Statt eines synthetischen Failing-Tests gilt der Positiv-Nachweis:

```bash
# Frontmatter-Sanity (name + description vorhanden, Datei startet mit ---):
head -4 .opencode/skills/sdlc-autopilot/SKILL.md
# expected: PASS (Frontmatter vollständig — kein RED möglich, da Neuaufnahme)
```

- [ ] **Fix-Step (GREEN).** Skill-Datei committen und Inhalt gegen die
      verifiziert identische Sicherung prüfen:

```bash
diff /tmp/opencode/dispatch-T016415-T016416/sdlc-autopilot-backup/SKILL.md \
     .opencode/skills/sdlc-autopilot/SKILL.md && echo IDENTICAL
git ls-files --error-unmatch .opencode/skills/sdlc-autopilot/SKILL.md
# expected: IDENTICAL + Datei ist getrackt
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Merge-Reihenfolge

T016416 (KV-Ladder-Integration) zuerst oder gemeinsam mergen — der Skill
setzt den `SDLC_CONTEXT_CEILING`-Vertrag dokumentarisch voraus.
