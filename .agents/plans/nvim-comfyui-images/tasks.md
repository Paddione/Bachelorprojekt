---
title: nvim-comfyui-images implementation plan
ticket_id: T900666
domains: [developer-experience, vim]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-comfyui-images — Implementation Plan

Zweck (Deutsch). Dieser Plan baut das Dashboard-Kapitel **ComfyUI & Images** (Ticket T900666, EPIC T900654) in der projektbewussten Neovim-Konfiguration. Das Kapitel bündelt Server-Zugriff, Status, Queue, Logs und Ressourcennutzung des ComfyUI-GPU-Hosts sowie die geordneten Prozeduren start, use, troubleshoot, unload und stop. Alle acht Aktionen laufen über das sichtbare Aktionsmodell der Dashboard-Foundation (T900655): Fokussieren führt nichts aus, erst der explizite Schritt startet die Aktion. Unload und Stop prüfen vorher fail-closed die ComfyUI-Queue und verweigern bei aktiven Jobs. Jede Aktion und jeder Runbook-Schritt tragen gleiche Namen in gleicher Reihenfolge; das Runbook wird im Master-Index geführt. OpenSpec bleibt aus dem Dashboard heraus; kein neues Plugin; kein format-on-save; keine versteckten Deployments oder Git-Mutationen; Git-Root immer aus dem aktuellen Buffer.

Live-Befunde aus dem Scouting (verifiziert am Worktree-Stand, keine Snapshot-Annahmen): `dotfiles/nvim/lua/config/dashboard.lua` (271 Zeilen) führt das Kapitel in Zeile 48 als `{ key = '9', title = 'ComfyUI & Images', page = 'comfyui-images' }`; der Registrierungsanker für die neue Seite ist der `['files-search']`-Eintrag (Zeilen 97–142) vor der schließenden `}` der `pages`-Tabelle in Zeile 143. `runbooks/README.md` Zeile 23 markiert das Kapitel als `stub`. `tests/spec/neovim-dashboard.bats` (778 Zeilen) endet mit dem files-search-Runbook-Test; neue Tests werden am Dateiende unter einer kapitel-eindeutigen Markierung angehängt. Verifizierte ComfyUI-Endpunkte aus Repo-Code: `/system_stats` (`docs/runbooks/asset-gen-gpu-host.md`), `/upload/image`, `/prompt`, `/history/{id}`, `/view` (`components/website/src/lib/comfy-client.ts`); Start via `scripts/start-comfyui.sh` (screen-Sessions `comfyui`/`rigger`, Ports 8189/8190), Logs `~/comfyui.log`/`~/rigger.log`. Befund zum Queue-Schutz: Im Repo existiert kein Stop-Skript und kein bestehender Unload/Stop-Guard — der Schutz wird daher in diesem Kapitel neu implementiert (fail-closed Queue-Prüfung vor unload/stop) und per Test bewiesen. Die Upstream-Endpunkte `/queue` und `/free` sind im Repo nicht belegt; Partial p1 verifiziert sie vor dem Verdrahten gegen einen live ComfyUI-Server oder die gepinnte Upstream-Quelle. Werkzeuge auf PATH verifiziert: `nvim` v0.12.5, `curl` 8.5.0. Prior-Art-Suche (T002829): keine Treffer in `docs/adr/` für `dotfiles/nvim`; einziger Treffer für `neovim-dashboard` in `tests/spec/` ist `tests/spec/neovim-dashboard.bats`.

## File Structure

### New files

- `dotfiles/nvim/lua/config/comfyui-images.lua` (comfyui-images.lua — Kapitelmodul mit acht Aktionen plus Queue-Schutz; .lua not S1-gated)
- `dotfiles/nvim/runbooks/comfyui-images.md` (comfyui-images.md — Runbook-Kapitel nach `_template.md`; .md not S1-gated)

### Changed files

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua — comfyui-images-Seite am files-search-Anker registrieren; .lua not S1-gated, no numeric budget claimed)
- `dotfiles/nvim/runbooks/README.md` (README.md — Kapitelzeile von stub auf complete stellen; .md not S1-gated, no numeric budget claimed)
- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats — Kapitel-Proben am Dateiende anhängen; .bats not S1-gated, no numeric budget claimed)
- `components/website/src/data/test-inventory.json` (test-inventory.json — via test inventory regeneriert; .json not S1-gated)

<!-- vitest: kein neuer Test nötig, weil kein Plan-Target unter components/website/src/lib oder pages/api liegt (comfy-client.ts ist nur Lese-Referenz, test-inventory.json wird nur generiert) -->

S1 note: no target carries a static limit here. Lua, Markdown, BATS-test and JSON files have no S1 limit entries in `docs/code-quality/gates.yaml` (`yq '.s1.limits' docs/code-quality/gates.yaml` lists only .astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php) and all three existing shared files report `nicht-baselined` via the `jq` baseline lookup. No baseline entries are added and no numeric budget is claimed for any file.

Shared-files-Regel für alle Partials: Vor dem Anfassen gemeinsam genutzter Dateien (`dashboard.lua`, `runbooks/README.md`, `neovim-dashboard.bats`) zuerst auf das neueste `origin/main` rebasieren (`git fetch origin main` plus Rebase des eigenen Branches), danach nur den eigenen kapitel-eindeutigen Block einfügen und fremde Kapitelblöcke unverändert lassen. Alle `dotfiles/`-Pfade werden per `git add -f` aufgenommen (`dotfiles/` ist gitignoriert, Repo-Konvention).

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-module.md | impl | dotfiles/nvim/lua/config/comfyui-images.lua |  |
| p2 | tasks.d/p2-registration.md | impl | dotfiles/nvim/lua/config/dashboard.lua, dotfiles/nvim/runbooks/README.md | p1 |
| p3 | tasks.d/p3-runbook.md | impl | dotfiles/nvim/runbooks/comfyui-images.md | p1 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/neovim-dashboard.bats, components/website/src/data/test-inventory.json | p1,p2,p3 |

Execution order honoring depends_on: p1 first, then p2 and p3 in any order, then p4, then Task 5. Each partial commits its own files as `feat(T900666): <subject> [T900666]` with explicit pathspecs (`git add -f` for dotfiles paths — dotfiles/ is gitignored, force-add per repo convention), never broad adds.

## Task 5: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/nvim-comfyui-images/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (module shape, page order, queue guard refuses on active jobs, runbook step order, red-green proof) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
