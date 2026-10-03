---
title: nvim-models-inference implementation plan
ticket_id: T900663
domains: [test, docs]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-models-inference — Implementation Plan

_partial-index —_

Zweck: Diese Planung liefert das Dashboard-Kapitel Models und Inference (T900663) der projektbewussten Neovim-Konfiguration. Das Kapitel macht den lokalen Modell-Stack im Editor sichtbar und steuerbar: Modell- und Server-Status, Server-Konfiguration, Logs, GPU- und VRAM-Ressourcen sowie explizite Start-, Stop- und Tuning-Prozeduren. Alle Fakten wurden am 2026-09-28 live erhoben (keine Snapshot-Uebernahme): `:1919` bedient `Qwen3.8-27B-gsq-iq2s` (Unit `qwen38-gsq-iq2s`, aktiv), `:1920` bedient `Qwen3.5-4B-MTP` (Unit `qwen35-mtp`, aktiv), `:1234` ist LM Studio (Prozess `llmster`, aktiv), llm-proxy liegt im devmesh-Pod `llm-services` (Forward `:18235`, antwortet mit Auth-Fehler). FreeToken ist ausgemustert (T900363) und wird nicht uebernommen. Der Ausfuehrer verifiziert jeden dieser Fakten vor der Implementierung erneut.

Prior-art (T002829, 2026-09-28): `grep -rn dotfiles/nvim docs/adr/` ohne Treffer; `grep -rln neovim-dashboard tests/spec/` trifft nur die Spezifikationsdatei `tests/spec/neovim-dashboard.bats` selbst.

## File Structure

### New files

- `dotfiles/nvim/lua/config/models-inference.lua` (models-inference.lua — Kapitelmodul mit sechs Aktionsfunktionen plus Helfern; .lua not S1-gated)
- `dotfiles/nvim/runbooks/models-inference.md` (models-inference.md — Kapitel-Runbook mit den sechs Aktions-Schritten in Dashboard-Reihenfolge; .md not S1-gated)

### Changed files

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua — Registrierung der Seite `models-inference` als minimaler Anchor-Append im `pages`-Block; .lua not S1-gated)
- `dotfiles/nvim/runbooks/README.md` (README.md — Zeile 21 von `status: stub` auf `status: complete` mit Link auf das neue Runbook; .md not S1-gated)
- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats — neuer T900663-Block am Dateiende hinter eigenem Marker; .bats not S1-gated)
- `components/website/src/data/test-inventory.json` (test-inventory.json — Regenerat via Test-Inventar; .json not S1-gated)

S1 note: `docs/code-quality/gates.yaml` (`s1.limits`, gelesen per `grep -A15 '  limits:'`) enthaelt keine Eintraege fuer `.lua`, `.md`, `.bats` oder `.json`; alle vier geaenderten Dateien melden zudem `nicht-baselined` in `docs/code-quality/baseline.json` (geprueft per dokumentiertem `jq`-Lookup). Keine der Zieldateien ist damit budgetiert; es darf kein Baseline-Eintrag hinzugefuegt werden.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-module.md | impl | dotfiles/nvim/lua/config/models-inference.lua |  |
| p2 | tasks.d/p2-registration.md | impl | dotfiles/nvim/lua/config/dashboard.lua | p1 |
| p3 | tasks.d/p3-runbook.md | impl | dotfiles/nvim/runbooks/models-inference.md, dotfiles/nvim/runbooks/README.md | p1 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/neovim-dashboard.bats, components/website/src/data/test-inventory.json | p1,p2,p3 |

Execution order honoring depends_on: p1 first; p2 and p3 after p1 (either order); p4 after p1, p2, p3; then Task 5. Each partial commits its own files as `feat(T900663): <subject> [T900663]` with explicit pathspecs (`git add -f` for dotfiles paths — dotfiles/ is gitignored, force-add per repo convention), never broad adds. Before touching a shared file, the executor rebases the branch onto latest `origin/main` (`git fetch origin main && git rebase origin/main` from the worktree root) and keeps every other chapter block intact. No partial creates `openspec/` directories, and the dashboard must not integrate OpenSpec.

## Task 5: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/nvim-models-inference/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (module loads headless, dashboard page lists six actions in order, runbook actions match the dashboard, bats block green, inventory regenerated) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
