# Partial p1 — Skill-Erweiterung: headed-verify Stufe

## Scope
Erweiterung des `dev-flow-e2e` Skills um eine optionale Headed-Test-Stufe.

## Task List
- [x] **1.1** `.agents/skills/dev-flow-e2e/SKILL.md`: optionalen `headed-verify` Schritt dokumentieren
- [x] **1.2** Trigger definieren: `--headed` Flag oder `HEADED_VERIFY=true` Env
- [x] **1.3** Ablauf beschreiben: Agent → Playwright → Vision → Ergebnis

## Verification
```bash
grep -A 5 headed-verify .agents/skills/dev-flow-e2e/SKILL.md
```
