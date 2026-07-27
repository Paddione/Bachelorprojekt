# p4 — Tests umbauen, SSOT-Specs entfernen, Artefakte regenerieren

Rolle: `tests`. `depends_on: p1, p2, p3`. Letztes Partial.

`target_files`: `tests/spec/dev-flow-plan.bats`, `tests/spec/dev-flow-execute.bats`,
`tests/spec/superpowers-writing-plans.bats`, `tests/spec/superpowers-executing-plans.bats`,
`openspec/specs/superpowers-writing-plans.md`, `openspec/specs/superpowers-executing-plans.md`.

Kernpunkt: Die beiden zu entfernenden BATS-Dateien sind zweigeteilt. Die ersten fünf Tests je
Datei prüfen den Stub selbst und verschwinden mit ihm. Die letzten vier prüfen `dev-flow-plan`
bzw. `dev-flow-execute` direkt und sind echte Regressionsabsicherung — sie werden **umgezogen,
nicht gelöscht**. Die Testnamen sind hier die Designdokumentation: sie halten fest, welche
Eigenschaft des Skills abgesichert sein soll.

## Aufgaben

- [ ] **P4.1 — RED: `tests/spec/dev-flow-execute.bats` anlegen.** Die Datei existiert noch
      nicht. Sie erhält die vier aus `tests/spec/superpowers-executing-plans.bats` übernommenen
      Tests (`dev-flow-execute SKILL.md exists`, `… contains worktree isolation check`,
      `… contains branch guard`, `… contains gh pr merge command`, `… contains squash merge`)
      plus eine neue Assertion, dass kein `.claude/skills/superpowers-*`-Verzeichnis mehr
      getrackt ist. Vor der Umsetzung von p1 schlägt genau diese Assertion fehl:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-execute.bats
# expected: FAIL (rot — die Stub-Verzeichnisse existieren noch)
```

- [ ] **P4.2 — `tests/spec/dev-flow-plan.bats` erweitern.** Die Datei existiert (111 Zeilen).
      Sie übernimmt die vier planbezogenen Tests aus
      `tests/spec/superpowers-writing-plans.bats`: `dev-flow-plan SKILL.md exists`,
      `… mentions plan-lint rules`, `… references Step 3.7`, `… mentions frontmatter keys`.
      Vor dem Kopieren prüfen, ob eine dieser Zusicherungen dort bereits in anderer Formulierung
      steht — Duplikate sind zu vermeiden:

```bash
grep -n '^@test' tests/spec/dev-flow-plan.bats
```

- [ ] **P4.3 — Die zwei alten BATS-Dateien entfernen.**

```bash
git rm -q tests/spec/superpowers-writing-plans.bats tests/spec/superpowers-executing-plans.bats
```

- [ ] **P4.4 — Die zwei SSOT-Specs entfernen.** Ihre Anforderungen sind im Delta unter
      `openspec/changes/skill-inventory-cleanup/specs/agent-skills.md` als `## REMOVED
      Requirements` mit Begründung und Migrationshinweis dokumentiert:

```bash
git rm -q openspec/specs/superpowers-writing-plans.md openspec/specs/superpowers-executing-plans.md
task openspec:validate
```

- [ ] **P4.5 — Grüner Lauf beider Zieldateien.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats tests/spec/dev-flow-execute.bats
```

- [ ] **P4.6 — Docs-Rebuild.** `k3d/docs-content-built/` enthält vorgebautes HTML mit rund 24
      Seiten je entferntem Skill. Es wird aus `docs/` und den Skill-Dateien kompiliert:

```bash
node scripts/build-docs.mjs
git status --porcelain k3d/docs-content-built | head -20
```

      Das Ausrollen (`task docs:deploy`, baut ein Image — `docs:sync` funktioniert nicht wegen
      read-only rootfs) ist ein Post-Merge-Schritt und **nicht** Teil dieses Changes.

- [ ] **P4.7 — Test-Inventar regenerieren.** CI vergleicht `website/src/data/test-inventory.json`
      gegen eine Neuberechnung und schlägt bei Abweichung fehl. Da p4 eine BATS-Datei anlegt und
      zwei entfernt, ändert sich das Inventar zwingend:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [ ] **P4.8 — Inventar-Assertion.**

```bash
git ls-files -- .claude/skills | grep -c '/SKILL\.md$'   # erwartet: 28
bash scripts/health-goals-check.sh 2>/dev/null | grep -E 'G-AGENTIC0[67]'
```

- [ ] **P4.9 — Finale Verifikation.** Die drei verpflichtenden CI-Gates. Alle dabei
      regenerierten Artefakte mitcommitten:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Abnahmekriterien

- `tests/spec/dev-flow-execute.bats` existiert und läuft grün; die Assertion auf fehlende
  `superpowers-*`-Verzeichnisse ist enthalten.
- `tests/spec/dev-flow-plan.bats` enthält die vier übernommenen Tests, ohne Duplikate.
- Die zwei alten BATS-Dateien und die zwei SSOT-Specs sind entfernt.
- `task openspec:validate` grün.
- `task test:changed`, `task freshness:regenerate`, `task freshness:check` grün.
- Getrackte `SKILL.md`: 28. G-AGENTIC06 und G-AGENTIC07: je 0.
