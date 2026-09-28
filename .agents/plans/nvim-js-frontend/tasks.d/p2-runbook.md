## Task 2: js-frontend chapter runbook

Context. This partial writes the chapter runbook for ticket T900658 after p1 fixed the module surface. It owns exactly one new file and starts from `dotfiles/nvim/runbooks/_template.md`, following the worked `files-search.md` example. The runbook documents the page `js-frontend` with the pinned twelve-action order from the plan index; dashboard order, frontmatter `actions` order and step order are identical, which the tests partial verifies mechanically.

Target files (NEW):

- `dotfiles/nvim/runbooks/js-frontend.md` (js-frontend.md): the chapter runbook with machine header plus the five required sections.

### Steps

- [ ] Create `dotfiles/nvim/runbooks/js-frontend.md` with the machine header: `page: js-frontend`, `ticket: T900658`, `status: complete`, and the twelve `actions` entries in the pinned index order (`goto-page`, `goto-component`, `goto-layout`, `goto-route`, `goto-design`, `dev`, `preview`, `lint`, `type-check`, `build`, `test`, `lsp-status`).
- [ ] Write `## Voraussetzungen`: Neovim v0.12.5 with the dashboard foundation; Telescope plus ToggleTerm present as kept plugins (no new plugin needed); a buffer inside a Git checkout (all actions resolve the Git root at execution time); `node` plus `pnpm` on `PATH` for website actions and `npm` for brett/root actions; dependencies installed once per boundary (`pnpm install` inside `components/website`, `npm install` inside `components/brett`) before running dev or build; the T900656 editor capabilities installed so `lsp-status` has servers and parsers to report.
- [ ] Write `## Geordnete Schritte` as twelve numbered steps, each opening with the bold action name in pinned order (`1. **goto-page**: ...` through `12. **lsp-status**: ...`), describing how to reach the page (`<leader>h`, chapter `2`), how focusing differs from executing (moving the cursor runs nothing; Enter or the pinned key runs the action), the exact picker roots for the five navigation actions, the exact ToggleTerm commands per buffer target for the six lifecycle actions (including the preview-on-brett and lifecycle-on-root warnings), and the `lsp-status` summary lines. State the file-to-URL route mapping (`index.astro` to `/`, `[service].astro` to a dynamic segment, `api/*.ts` to `/api/*`) and the package boundary (website left to pnpm, brett and root to npm).
- [ ] Write `## Erwartetes Ergebnis` (the page renders exactly the twelve actions in order; pickers open at the documented roots; lifecycle commands appear in a horizontal terminal; `lsp-status` lists five servers plus six parsers), `## Troubleshooting` (no-git-root warning, Telescope or ToggleTerm not loaded, preview on a brett buffer, pnpm/npm mixup, `astro check` failure hints, empty design picker when the styles checkout is sparse), and `## Recovery` (close the terminal with `:ToggleTerm` toggling, remove the page by deleting the p1 module plus the p3 registration block so the auto-stub takes over again).
- [ ] Verify the header and sections mechanically from the worktree root:
  ```bash
  awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' dotfiles/nvim/runbooks/js-frontend.md > /tmp/jsf-actions.txt
  printf 'goto-page\ngoto-component\ngoto-layout\ngoto-route\ngoto-design\ndev\npreview\nlint\ntype-check\nbuild\ntest\nlsp-status\n' > /tmp/jsf-want.txt
  diff /tmp/jsf-want.txt /tmp/jsf-actions.txt
  for s in Voraussetzungen "Geordnete Schritte" "Erwartetes Ergebnis" Troubleshooting Recovery; do grep -q "^## $s" dotfiles/nvim/runbooks/js-frontend.md || { echo "missing section: $s"; exit 1; }; done
  grep -q '^status: complete' dotfiles/nvim/runbooks/js-frontend.md
  ```
  The diff must be empty, every section must exist, and the status line must read complete.
- [ ] Commit the single file with an explicit force-add (dotfiles/ is gitignored):
  ```bash
  git add -f dotfiles/nvim/runbooks/js-frontend.md
  git commit -m "feat(T900658): js-frontend chapter runbook [T900658]"
  ```

### Acceptance criteria

- `dotfiles/nvim/runbooks/js-frontend.md` exists with the exact machine header and the twelve actions in pinned order.
- The five required sections exist; the twelve numbered steps open with the bold action names in the same order.
- Prerequisites name the verified tool versions and the per-boundary install commands; troubleshooting covers the six listed failure modes; recovery documents terminal close plus page removal.
- The mechanical header and section checks pass.
- The commit uses the `feat(T900658): <subject> [T900658]` shape and tracks exactly the one force-added file.
