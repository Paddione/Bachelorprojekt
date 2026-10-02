---
title: "nvim-sdlc — Implementation Plan"
ticket_id: T900660
domains: [test, docs]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-sdlc — Implementation Plan

Dieser Plan baut das Dashboard-Kapitel SDLC (Ticket T900660, EPIC T900654) als
projektbewusste Neovim-Seite: neun Aktionen in fester Reihenfolge
(tickets-list, triage-show, readiness-show, deps-show, plan-open, exec-status,
verify-gates, close-check, process-docs), die den Weg einer Arbeitseinheit von
Ticketanlage bis Abschluss abbilden und dabei Dateien, Worktree, Checks und PR
sichtbar verknuepfen. Alle Aktionen sind strikt lesend (Anzeigen im
Scratch-Buffer, Oeffnen von Skill- und Plandateien); mutierende Schritte
(Triage-Entscheid, Statuswechsel, Deploy) werden nur als kopierbare Kommandos
gezeigt und nie ausgefuehrt. OpenSpec bleibt aus dem Kapitel heraus: Weder
Modul noch Registrierung noch Runbook referenzieren OpenSpec-Pfade oder
-Skills; die wiederverwendete Prozessdoku wird vorab auf OpenSpec-Bezuege
geprueft. Suche springt zur Aktion, Ausfuehren bleibt ein separater bewusster
Schritt; Git-Root kommt immer aus dem aktuellen Buffer.

Live verifiziert am Worktree-Stand (keine Snapshot-Annahmen): `dashboard.lua`
fuehrt SDLC als Kapitel 4 (`sdlc`, Stub per Auto-Stub-Schleife); der
Einhaengeanker ist Zeile 143 (`}` schliesst `local pages`), neuer
`['sdlc']`-Block hinter dem files-search-Block (Zeilen 101-142).
`runbooks/README.md` Zeile 18 markiert SDLC als stub. Die BATS-Datei endet mit
dem T900657-Block (778 Zeilen); neue Tests haengen am Dateiende unter eigenem
Marker an. Kanonische Kommandos verifiziert: `ticket.sh get/list/triage/
update-status/phase/get-ticket-links/get-timeline --help` (alle mit
`--id`-Form), echter Aufruf `get-ticket-links --id T900660` liefert
`child_of: [T900654]`; `task --list` enthaelt `test:changed`,
`freshness:check`, `freshness:regenerate`, `test:inventory`; Skills
`.agents/skills/{ticket-triage,ticket-dispatch,dev-flow-plan,dev-flow-execute}/
SKILL.md` existieren. Prior-Art (T002829): `docs/adr/` ohne Treffer zu
`dotfiles/nvim`; `tests/spec/` liefert genau `tests/spec/neovim-dashboard.bats`
(die erweiterte Datei). Bestehendes Plugin-Inventar bleibt unveraendert; das
Kapitel braucht kein neues Plugin (nur `ticket.sh`/`git`/`task` als
Subprozesse plus eingebaute Buffer-APIs).

## File Structure

### New files

- `dotfiles/nvim/lua/config/sdlc.lua` (Kapitelmodul: neun lesende Aktionen, Scratch-Darstellung, Branch-Ticket-Aufloesung; .lua not S1-gated)
- `dotfiles/nvim/runbooks/sdlc.md` (Kapitel-Runbook mit actions[] in Dashboard-Reihenfolge; .md not S1-gated)

### Changed files

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `dotfiles/nvim/lua/config/dashboard.lua` | 271 | n/a (S1-ungated) |
| `dotfiles/nvim/runbooks/README.md` | 43 | n/a (S1-ungated) |
| `tests/spec/neovim-dashboard.bats` | 778 | n/a (S1-ungated) |
| `components/website/src/data/test-inventory.json` | 6038 | n/a (S1-ungated) |

S1 note: `grep -A15 '  limits:' docs/code-quality/gates.yaml` listet Limits nur
fuer .astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php;
.lua/.md/.bats/.json tragen kein S1-Limit. Alle vier geaenderten Dateien melden
per `jq` `nicht-baselined`. Es kommen keine Baseline-Eintraege hinzu.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-module.md | impl | dotfiles/nvim/lua/config/sdlc.lua |  | 27b-local | 32000 |
| p2 | tasks.d/p2-registration.md | impl | dotfiles/nvim/lua/config/dashboard.lua | p1 | 27b-local | 16000 |
| p3 | tasks.d/p3-runbook.md | impl | dotfiles/nvim/runbooks/sdlc.md, dotfiles/nvim/runbooks/README.md | p1, p2 | 4b-local | 16000 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/neovim-dashboard.bats, components/website/src/data/test-inventory.json | p1, p2, p3 | 27b-local | 32000 |

Execution order honoring depends_on: p1 first, then p2, then p3, then p4, then
Task 5. Each partial commits only its own manifest files as
`feat(T900660): <subject> [T900660]` (tests partial: `test(T900660): <subject>
[T900660]`) with explicit pathspecs (`git add -f` for dotfiles paths —
dotfiles/ is gitignored, force-add per repo convention), never broad adds.
Shared files (`dashboard.lua`, `runbooks/README.md`, BATS file,
`test-inventory.json`) werden per Anker-Append mit dem Marker `T900660`
angefasst: Der Executor rebased vor jedem Shared-File-Eingriff auf aktuelles
`origin/main`, prueft dass kein fremder Kapitelblock beschaedigt wird, und
haelt andere Kapitelbloecke unveraendert.

## Task 5: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/nvim-sdlc/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (module loads, nine actions in order, runbook coverage, no OpenSpec references, BATS green) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
