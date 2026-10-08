---
title: T900563 Serie 1 — tote Factory-Prosa in Skripten, CI-Texten, Docs und Test-Kommentaren
ticket_id: T900563
domains: [scripts, tests, docs]
status: staged
---

# factory-reste-serie1 — Implementation Plan

Serie 1 von T900563 (inkrementelle Chore-Serie, je Partial eigener PR):
tote Factory-Prosa in 20 Dateien bereinigen — ohne Verhaltens-, Schema- oder
API-Änderung. Aktive Verträge (DB-Schema, FACTORY-PLAN-REF, CSS-Vars, Typen,
Guard-Selbstreferenzen, Aggregator-/Scope-Namen) bleiben stehen und werden je
Datei im PR-Body begründet. Folge-Serien (Website-Begriffe, DB-Schema,
Rest-Prosa) sind in `proposal.md` als Next-Steps vermerkt, nicht Teil dieses
Plans. Mess-Konvention T002717: `git grep -I -l -i factory <sha> -- .
:!openspec/changes/archive :!openspec/specs/archive :!docs/superpowers/plans
:!docs/superpowers/specs :!scripts/llm/measurements | wc -l`, PRE 861da3387 =
443 Dateien (374 ohne `.agents/plans`-Historie).

## File Structure
- `scripts/repo-hygiene-precheck.sh` — Kommentar-Historie (P1)
- `scripts/vda/ticket/stage-plan.sh` — nur Meldungstexte (P1)
- `scripts/lib/ticket-help.sh` — Kommentar-Zeile (P1)
- `scripts/plan-touched-files.sh` — Kommentar-Zeile (P1)
- `commitlint.config.cjs` — Hinweis-Texte, Keys bleiben (P2)
- `.github/workflows/ci.yml` — Kommentare (P2)
- `.github/workflows/post-merge.yml` — Kommentare (P2)
- `.github/workflows/e2e-pr.yml` — Kommentare (P2)
- `.github/workflows/opencode.yml` — Kommentare (P2)
- `.github/workflows/codeql.yml` — Kommentare (P2)
- `docs/sdlc-stack/README.md` — Prosa (P3)
- `docs/sdlc-stack/e3-cutover.md` — Prosa (P3)
- `docs/runbooks/freetoken-native.md` — Prosa (P3)
- `docs/runbooks/db-audit-playbook.md` — Prosa (P3)
- `docs/superpowers/references/factory-usage.md` — Prosa (P3)
- `tests/spec/agent-roster.bats` — Kommentar-Prosa (P4)
- `tests/spec/database.bats` — Kommentar-Prosa (P4)
- `tests/spec/pipeline-interface.bats` — Kommentar-Prosa (P4)
- `tests/spec/website-core.bats` — Kommentar-Prosa (P4)
- `tests/spec/ci-cd.bats` — Kommentar-Prosa (P4)

## Partials
| id | file | role | target_files | depends_on |
| p1 | tasks.d/p1-skripte.md | impl | scripts/repo-hygiene-precheck.sh, scripts/vda/ticket/stage-plan.sh, scripts/lib/ticket-help.sh, scripts/plan-touched-files.sh |  |
| p2 | tasks.d/p2-ci-texte.md | impl | commitlint.config.cjs, .github/workflows/ci.yml, .github/workflows/post-merge.yml, .github/workflows/e2e-pr.yml, .github/workflows/opencode.yml, .github/workflows/codeql.yml |  |
| p3 | tasks.d/p3-docs.md | impl | docs/sdlc-stack/README.md, docs/sdlc-stack/e3-cutover.md, docs/runbooks/freetoken-native.md, docs/runbooks/db-audit-playbook.md, docs/superpowers/references/factory-usage.md |  |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/agent-roster.bats, tests/spec/database.bats, tests/spec/pipeline-interface.bats, tests/spec/website-core.bats, tests/spec/ci-cd.bats |  |

## Tasks
- [ ] P1 Skripte bereinigen — siehe `tasks.d/p1-skripte.md`
- [ ] P2 CI-Texte bereinigen — siehe `tasks.d/p2-ci-texte.md`
- [ ] P3 Docs bereinigen — siehe `tasks.d/p3-docs.md`
- [ ] P4 Test-Kommentare bereinigen — siehe `tasks.d/p4-tests.md`
- [ ] Finaler Verify-Task (STRUCT3): nach allen Partials im Worktree
  ausführen —
  `task test:changed`,
  `task freshness:regenerate`,
  `task freshness:check`
  — dazu `bats tests/spec/sf-retirement-rest.bats
  tests/spec/sf-retirement-web.bats
  tests/spec/decommission/decommission-guard.bats` (müssen grün bleiben)
  und Messbefehl vorher/nachher im PR-Body (T002717).
