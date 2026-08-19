---
title: "headed-vision-sweep — Implementation Plan"
ticket_id: T012781
domains: [test, website, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# headed-vision-sweep — Implementation Plan

_Ticket: T012781_ · _Design: `openspec/changes/headed-vision-sweep/design.md`_

## File Structure

```
tests/e2e/lib/vision-judge.ts                        (neu)  Anfrage, Schema-Prüfung, Erreichbarkeit
tests/e2e/lib/vision-judge.test.ts                   (neu)  vitest — reine Funktionen
tests/e2e/lib/visual-sweep-helpers.ts                (geä.) Typen + Pfad der Urteilsdatei
tests/e2e/specs/visual-sweep.spec.ts                 (geä.) ein Aufrufpunkt nach dem Screenshot
tests/e2e/playwright.visual-sweep.config.ts          (geä.) headed-tauglicher Worker-Deckel
tests/e2e/lib/build-gallery.mjs                      (geä.) Urteile im Kontaktbogen
Taskfile.yml                                         (geä.) Ziel test:e2e:visual-sweep:vision
tests/spec/e2e-test-infrastructure/vision-sweep.bats (neu)  Verdrahtungs-Guards
.claude/skills/dev-flow-e2e/SKILL.md                 (geä.) Schritt 8.5: 8094/8091 → Proxy
tests/e2e/specs/k8-headed-verify.spec.ts             (geä.) toter Vision-Aufruf → echter Pfad
components/website/src/data/test-inventory.json      (regen.) task test:inventory
```

## Partials

| id | file | role | target_files |
|----|------|------|--------------|
| p1 | tasks.d/p1-vision-client.md | impl | tests/e2e/lib/vision-judge.ts |
| p2 | tasks.d/p2-sweep-integration.md | impl | tests/e2e/specs/visual-sweep.spec.ts, tests/e2e/lib/visual-sweep-helpers.ts |
| p3 | tasks.d/p3-runner-config.md | impl | tests/e2e/playwright.visual-sweep.config.ts, Taskfile.yml |
| p4 | tasks.d/p4-report.md | impl | tests/e2e/lib/build-gallery.mjs |
| p5 | tasks.d/p5-doc-correction.md | impl | .claude/skills/dev-flow-e2e/SKILL.md, tests/e2e/specs/k8-headed-verify.spec.ts |
| p6 | tasks.d/p6-tests.md | tests | tests/e2e/lib/vision-judge.test.ts, tests/spec/e2e-test-infrastructure/vision-sweep.bats, components/website/src/data/test-inventory.json |

Abhängigkeiten: p2 baut auf p1 auf (nutzt dessen Modul), p4 auf p2 (liest dessen Ausgabedatei).
p3 und p5 sind unabhängig. p6 kommt zuletzt.

## S1-Budgets

Ermittelt mit `wc -l` gegen `docs/code-quality/baseline.json` (leeres Objekt `{}` — keine Datei
gebaselined, also gilt je Endung das Limit aus `docs/code-quality/gates.yaml`: `.ts` 900,
`.mjs` 800). Reserve ist überall reichlich; kein Split nötig.

Die Spalte „Ist" ist der Stand **nach** der Umsetzung. Ausgangswerte, gegen die geplant wurde:
visual-sweep.spec.ts 342, visual-sweep-helpers.ts 170, playwright.visual-sweep.config.ts 80,
build-gallery.mjs 253, k8-headed-verify.spec.ts 98.

| Datei | Ist | Budget |
|---|---|---|
| `tests/e2e/specs/visual-sweep.spec.ts` | 415 | 485 |
| `tests/e2e/lib/visual-sweep-helpers.ts` | 190 | 710 |
| `tests/e2e/playwright.visual-sweep.config.ts` | 113 | 787 |
| `tests/e2e/lib/build-gallery.mjs` | 323 | 477 |
| `tests/e2e/specs/k8-headed-verify.spec.ts` | 117 | 783 |

`Taskfile.yml` (`.yml`) und `.claude/skills/dev-flow-e2e/SKILL.md` (`.md`) haben in
`gates.yaml` → `s1.limits` keinen Eintrag und unterliegen dem Zeilengate nicht.
`tests/e2e/lib/vision-judge.ts` ist neu und liegt bei 274 Zeilen (Limit 900, Budget 626).

<!-- vitest: neuer Test in p6 vorgesehen (tests/e2e/lib/vision-judge.test.ts) -->

## Abschließende Verifikation

- [x] **Final Verification.** Nach allen Partials im Worktree ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich der Nachweis, dass die Nebenläufigkeitsgrenze eingehalten wird — dieser Schritt ist
der eigentliche Beleg für REQ-vs-03 und darf nicht durch Lesen des Codes ersetzt werden:

```bash
# Probelauf über zehn Routen je Project, während der Proxy mitzählt.
# Erwartet: die beobachtete Höchstzahl gleichzeitiger Anfragen ist 3, nicht 4.
cd tests/e2e
VISUAL_SWEEP_VISION=1 VISION_MAX_ROUTES=10 \
  ./node_modules/.bin/playwright test --config playwright.visual-sweep.config.ts \
  --headed --workers=3 \
  --project=visual-sweep-mentolder-desktop --project=visual-sweep-mentolder-mobile \
  --project=visual-sweep-korczewski-desktop --project=visual-sweep-korczewski-mobile
```
