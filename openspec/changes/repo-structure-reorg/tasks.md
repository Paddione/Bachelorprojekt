---
title: "repo-structure-reorg — Implementation Plan"
ticket_id: T006999
domains: [repo-structure, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# repo-structure-reorg — Implementation Plan

_Ticket: T006999 · Design: `openspec/changes/repo-structure-reorg/design.md`_

## File Structure

```
docs/agent-context/                                        NEU  persona.md, user.md, heartbeat.md (p1)
docs/superpowers/specs/2026-08-15-repo-structure-reorg-design.md   mitcommitten (p1)
QWEN.md                                                    ED   → Zeiger auf CLAUDE.md (p1)
SOUL.md IDENTITY.md USER.md HEARTBEAT.md                   DEL  git rm (p1)
design-system/                                             MV   → packages/design-system/ (p2)
art-library/                                               MV   → assets/art-library/ (p2)
brett/ studio-server/ mentolder-web/                       MV   → components/ (p3)
mediaviewer-widget/ VideoVault/                            MV   → components/ (p3)
website/                                                   MV   → components/website/ (p4)
tests/spec/repo-structure/                                 NEU  root-agent-md.bats (p1), packages-assets.bats (p2),
                                                                components-group.bats (p3), website-moved.bats (p4),
                                                                inventory-registered.bats (p5)
website/src/data/test-inventory.json                       REG  task test:inventory (p5, Commit)
.github/workflows/ Taskfile.yml taskfiles/ scripts/        ED   Referenz-Updates (p2–p4, D1-disjunkt)
tests/ .claude/ .opencode/ CLAUDE.md AGENTS.md u. a.       ED   Referenz-Updates (p2–p4)
```

## S1-Budgets (wirksame Schwelle, verifiziert in den Partial-Plänen)

Alle betroffenen Dateien sind **nicht-baselined** (`docs/code-quality/baseline.json` enthält
keinen S1-Key für sie) — wirksame Schwelle ist das statische Extension-Limit aus
`docs/code-quality/gates.yaml`. Die Edits sind reine Pfad-Substitutionen (zeilenneutral);
Zahlen nur dort, wo die Partial-Pläne sie gegen den Linter verifiziert haben:

| Datei | Ist - Baseline -> Budget | Anmerkung |
|---|---|---|
| `QWEN.md` | 335 - n/a -> unbegrenzt (kein `.md`-Limit) | wird auf ~15 Zeilen reduziert |
| `.claude/skills/ui-ux-pro-max/scripts/design_system.py` | 1329 - n/a -> -529 | B1b-Warn akzeptiert: kein Split nötig, Edit zeilenneutral (p2) |
| `design-system/build.mjs` | 85 - n/a -> 715 | Tiefenkorrektur + Zielsegment, zeilenneutral (p2) |
| `.claude/skills/ui-ux-pro-max/scripts/search.py` | 127 - n/a -> 673 | zeilenneutral (p2) |
| `brett/dev-start.sh` | 104 - n/a -> 696 | zeilenneutral (p3) |
| `tests/e2e/brett-globals.d.ts` | 42 - n/a -> 858 | zeilenneutral (p3) |
| `tests/e2e/specs/brett-hidden-figures.spec.ts` | 116 - n/a -> 784 | zeilenneutral (p3) |
| `scripts/health-goals-check.sh` | 772 - n/a -> 28 | zeilenneutral (p4) |
| `scripts/worktree-create.sh` | 593 - n/a -> 207 | zeilenneutral (p4) |
| `scripts/plan-lint.sh` | 661 - n/a -> 139 | zeilenneutral (p4) |

Alle übrigen betroffenen Dateien (Workflows, Taskfiles, tests, Root-MDs, Dockerfiles):
nicht-baselined, ohne S1-Limit-Key oder unter `s1.excludes` — Edits zeilenneutral,
Details je Partial-Plan.

## Partials

| id | Partial-Datei | Rolle | target_files | depends_on |
|---|---|---|---|---|
| p1-md-kur | tasks.d/p1-md-kur.md | impl | `docs/agent-context/persona.md`, `docs/agent-context/user.md`, `docs/agent-context/heartbeat.md`, `QWEN.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`, `docs/superpowers/specs/2026-08-15-repo-structure-reorg-design.md`, `tests/spec/repo-structure/root-agent-md.bats` | |
| p2-mini-moves | tasks.d/p2-mini-moves.md | impl | `design-system/**`, `art-library/**`, `.claude/skills/ui-ux-pro-max/scripts/design_system.py`, `.claude/skills/ui-ux-pro-max/scripts/search.py`, `tests/unit/test_art_library_manifest.bats`, `tests/unit/.coverage-allowlist`, `tests/spec/repo-structure/packages-assets.bats` | |
| p3-components | tasks.d/p3-components.md | impl | `brett/**`, `studio-server/**`, `mentolder-web/**`, `mediaviewer-widget/**`, `VideoVault/**`, `.github/workflows/build-brett.yml`, `.github/workflows/build-mentolder-web.yml`, `.github/workflows/build-mediaviewer-widget.yml`, `.github/workflows/build-videovault.yml`, `.claude/launch.json`, `brett/dev-start.sh`, `brett/src/server/migrations/001_session_events.sql`, `brett/src/server/migrations/003_share_tokens.sql`, `mentolder-web/Dockerfile`, `mediaviewer-widget/Dockerfile`, `VideoVault/Dockerfile`, `VideoVault/Dockerfile.prod`, `VideoVault/docker-compose.yml`, `tests/e2e/brett-globals.d.ts`, `tests/e2e/specs/brett-hidden-figures.spec.ts`, `tests/factory-eval/fixtures/T001935/expected.json`, `tests/figure-pack-assets.test.sh`, `tests/integration/brett-templates.bats`, `tests/local/NFA-13.sh`, `tests/spec/react-homepage-blocks.bats`, `tests/spec/s1-violations.bats`, `tests/spec/repo-structure/components-group.bats` | |
| p4-website | tasks.d/p4-website.md | impl | `website/**`, `components/website/**`, `.github/workflows/build-website.yml`, `.github/workflows/ci.yml`, `.github/workflows/build-sdlc-console.yml`, `.github/workflows/e2e-pr.yml`, `.github/workflows/health-goals.yml`, `.github/workflows/post-merge.yml`, `Taskfile.yml`, `taskfiles/Taskfile.dev-stack.yml`, `taskfiles/Taskfile.staging.yml`, `.gitattributes`, `.gitignore`, `.dockerignore`, `compose.dev.yaml`, `docs/code-quality/gates.yaml`, `docs/code-quality/subsystems.yaml`, `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `scripts/**`, `tests/**`, `.claude/**`, `.opencode/**`, `tests/spec/repo-structure/website-moved.bats` | p1-md-kur,p2-mini-moves,p3-components |
| p5-tests | tasks.d/p5-tests.md | tests | `tests/spec/repo-structure/inventory-registered.bats`, `website/src/data/test-inventory.json` | p1-md-kur,p2-mini-moves,p3-components,p4-website |

> **D1-Dokumentation:** Querschnitts-Referenzdateien (Taskfile.yml, taskfiles/*.yml,
> `.github/workflows/ci.yml`, `docs/code-quality/gates.yaml`, Root-MDs, scripts/tests-Sweeps)
> gehören geschlossen an p4-website — auch deren verbliebene Referenzen auf die p2/p3-Move-
> Ziele werden dort EINMAL auf den Endzustand gebracht. p2/p3 fassen Querschnitts-Dateien
> nicht an (in den Partial-Plänen dokumentiert). `website/src/data/test-inventory.json`
> gehört ausschließlich an p5-tests; p1–p4 regenerieren sie nur lokal für den eigenen
> Verify. Zwischenzustände auf dem Branch dürfen einzelne Checks rot zeigen
> (z. B. freshness nach p3, `task assets` zwischen p2 und p4) — der Squash-Merge-Endzustand
> ist grün; das ist das einzige CI-relevante Gate.

## Verify (RED → GREEN)

Jedes Partial trägt seinen eigenen RED→GREEN-Guard-Lauf (wörtliches `expected: FAIL`
im jeweiligen Partial-Plan). Der Gesamt-Zustand wird in p5-tests verifiziert:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/repo-structure*   # alle fünf Guards grün
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **RED (je Partial).** Der jeweilige Guard schlägt vor dem Move fehl
      (`expected: FAIL` im Partial-Plan).
- [ ] **GREEN (je Partial).** Nach dem Move und den Referenz-Updates ist derselbe
      Guard grün.
- [ ] **Final Verification (p5-tests).** Die drei mandatorischen CI-Gates laufen
      grün gegen den Endzustand:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
