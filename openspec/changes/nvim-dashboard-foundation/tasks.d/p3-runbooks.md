## Task 3: Runbook template, master index, home runbook

Context: this partial delivers the runbook system of change nvim-dashboard-foundation (ticket T900655): a reusable template, the master index with the fixed chapter order, and the Home reference runbook. Page and action names come from `design.md` sections 6 and 7, so this partial needs no plan-time input from the dashboard partial (p2); at execution time it runs after p2 so the self-check can compare against the implemented Home actions. All three target files are new Markdown files, and Markdown files carry no S1 line gate, so no budget accounting applies to them.

Targets (each referenced by full repo-relative path and basename):

- `dotfiles/nvim/runbooks/_template.md` (_template.md) — runbook template with machine-readable header plus H2 sections.
- `dotfiles/nvim/runbooks/README.md` (README.md) — master index with the fixed chapter order, per-chapter local table of contents, and stub marks.
- `dotfiles/nvim/runbooks/home.md` (home.md) — reference runbook for the Home page with real content.

### Steps

1. Create the template file `dotfiles/nvim/runbooks/_template.md` (_template.md). Give it a machine-readable YAML header with exactly the keys `page`, `ticket`, `status` (allowed values `stub` or `complete`), and `actions` (an ordered list of action names in dashboard order), followed by exactly these five H2 sections in this order (German, per design.md section 7): `Voraussetzungen`, `Geordnete Schritte`, `Erwartetes Ergebnis`, `Troubleshooting`, `Recovery`. Each section carries one short guidance paragraph explaining what an author must write there. Example header sketch:
   ```markdown
   ---
   page: home
   ticket: T900655
   status: complete
   actions:
     - Files & Search
     - JavaScript / Frontend
   ---
   ```
2. Create the master index file `dotfiles/nvim/runbooks/README.md` (README.md). It lists exactly the ten surviving chapters in the fixed EPIC order from `design.md` section 6, with no Factory chapter:
   1. Files & Search (T900657)
   2. JavaScript / Frontend (T900658)
   3. GitHub (T900659)
   4. SDLC (T900660)
   5. Repository & Code Knowledge (T900661)
   6. AI & Agents (T900662)
   7. Models & Inference (T900663)
   8. Infrastructure (T900664)
   9. ComfyUI & Images (T900666)
   10. Settings & Help (T900667)
   Each chapter gets one entry with its owning ticket id and stub mark (`status: stub`); page-level tables of contents arrive with the chapter tickets, which define the pages. The Home entry links to `home.md` as complete. The index states that chapter order and action names must match the dashboard exactly.
3. Create the reference runbook file `dotfiles/nvim/runbooks/home.md` (home.md). It implements the template from step 1 for the Home page with real content: header `page: home`, `ticket: T900655`, `status: complete`, and `actions` listing the ten chapter names in the exact order of step 2. `Voraussetzungen` covers an installed Neovim and the repo config installed via `dotfiles/install.sh`. `Geordnete Schritte` walks through opening Neovim, reading the Home chapter list, moving to a chapter, selecting it to focus without executing, running the focused action as a separate explicit step, and navigating back. `Erwartetes Ergebnis` describes the rendered Home list. `Troubleshooting` covers a missing dashboard and an empty chapter list. `Recovery` documents the rollback move of `~/.config/nvim.old-20260927` back to `~/.config/nvim`.
4. Self-check: verify that action names and order in the index match the dashboard Home actions from `design.md` section 6, and list every stub-marked chapter. Run these commands (all flags verified against the installed GNU tools):
   ```bash
   grep -n "^## " dotfiles/nvim/runbooks/_template.md
   grep -n "status:" dotfiles/nvim/runbooks/home.md dotfiles/nvim/runbooks/README.md
   grep -n "actions:" -A 12 dotfiles/nvim/runbooks/home.md
   grep -c "stub" dotfiles/nvim/runbooks/README.md
   ```
   Confirm by reading the output: the template shows the five H2 sections in template order; `home.md` reports `status: complete` with ten actions in the order of step 2; the index marks all ten chapter runbooks as stub and contains the chapters in the exact order of step 2 with no Factory entry. At execution time, additionally compare the ten names and their order against the Home actions implemented by the dashboard partial and fix any mismatch on the runbook side.
5. Stage and commit only the three new files. The `dotfiles/` tree is gitignored, so force-add the explicit paths and never stage the whole tree:
   ```bash
   git add -f dotfiles/nvim/runbooks/README.md dotfiles/nvim/runbooks/_template.md dotfiles/nvim/runbooks/home.md
   git commit -m "feat(T900655): runbook template, master index, and home runbook [T900655]"
   ```
   Do not use a blanket stage command.

### Acceptance criteria

1. `dotfiles/nvim/runbooks/_template.md` (_template.md) exists with a machine-readable header (`page`, `ticket`, `status`, ordered `actions`) and the five H2 sections `Voraussetzungen`, `Geordnete Schritte`, `Erwartetes Ergebnis`, `Troubleshooting`, `Recovery` in that order.
2. `dotfiles/nvim/runbooks/README.md` (README.md) exists, lists the ten chapters in the exact order of step 2 with owning ticket and stub mark per chapter, links Home to `home.md`, and contains no Factory chapter.
3. `dotfiles/nvim/runbooks/home.md` (home.md) exists, follows the template, carries `status: complete`, and its `actions` list matches the ten dashboard Home chapter names in dashboard order.
4. The step 4 self-check was executed: action names and order agree between index and dashboard Home actions, and the stub-marked chapters are listed.
5. The implementation commit exists as `feat(T900655): runbook template, master index, and home runbook [T900655]` and stages exactly the three dotfiles paths via explicit `git add -f`, with no blanket staging.
