# Tasks: K8 Agentische Headed-Tests

| id | file | role | target_files | depends_on |
|----|------|------|-------------|------------|
| 1 | .agents/skills/dev-flow-e2e/SKILL.md | spec | .agents/skills/dev-flow-e2e/SKILL.md | — |
| 2 | tests/e2e/specs/k8-headed-verify.spec.ts | test | tests/e2e/specs/k8-headed-verify.spec.ts | 1 |
| 3 | .github/workflows/e2e.yml | docs | .github/workflows/e2e.yml | 1 |

## Partials

### 1 — Skill-Erweiterung: headed-verify Stufe

**target_files:** `.agents/skills/dev-flow-e2e/SKILL.md`

- Optionalen `headed-verify` Schritt dokumentieren
- Trigger: `--headed` Flag oder `HEADED_VERIFY=true`
- Ablauf beschreiben: Agent → Playwright → Vision → Ergebnis

### 2 — Playwright-Headed-Test-Spezifikation

**target_files:** `tests/e2e/specs/k8-headed-verify.spec.ts`

- Agenten-lesbare Test-Parameter (welche URL, welche Elemente)
- Headed-Modus (`headless: false`)
- Vision-Integration (Screenshot → Port 8094 → Validierung)
- Explizit: kein `test.describe` mit CI-Only-Tags — dieser Test läuft NUR manuell/agentisch

### 3 — CI-Dokumentation: kein Pflichtpfad

**target_files:** `.github/workflows/e2e.yml`

- Kommentar/Doku: K8 ist explizit kein CI-Gate
- Keine Änderung an der Workflow-Logik
