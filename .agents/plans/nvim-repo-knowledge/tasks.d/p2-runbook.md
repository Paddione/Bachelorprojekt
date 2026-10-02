## Task p2: Repository & Code Knowledge runbook chapter (docs role)

Context. This partial runs after p1 has landed, because the runbook documents the implemented dashboard page and module. It owns exactly one NEW runbook file and creates no other file. The runbook file `repo-knowledge.md` is Markdown and carries no S1 limit entry. Page actions, names and order come from p1 (`task-discover`, `k3-status`, `k3-symbol`, `k3-trace`, `project-docs`, `runbook-open`, `check-freshness`, `check-manifests`, `code-maps`); the runbook steps carry the same names in the same order per the EPIC cross-cutting rule. All commands named here were verified live at plan time (oracle fallback, K3 `cli` stdin JSON, the four task targets, generated-map paths); the author re-verifies each one while writing and records only what holds.

Target files:

- `dotfiles/nvim/runbooks/repo-knowledge.md` (NEW runbook chapter: prerequisites, ordered steps, expected result, troubleshooting, recovery)

### Steps

1. Create `dotfiles/nvim/runbooks/repo-knowledge.md` following `runbooks/_template.md` with frontmatter `page: repo-knowledge`, `ticket: T900661`, `status: complete`, and `actions` in exact dashboard order: `task-discover`, `k3-status`, `k3-symbol`, `k3-trace`, `project-docs`, `runbook-open`, `check-freshness`, `check-manifests`, `code-maps`.
2. Write the five required sections: Voraussetzungen (Neovim v0.12.5 with the dashboard foundation, Telescope + ToggleTerm from the kept set, `rg` only if grep pickers are used, K3 binary optional with graceful degradation, git-rooted buffer); Geordnete Schritte (nine numbered steps, one per action, each naming how focus differs from execute and what inputs the action prompts for); Erwartetes Ergebnis (the nine rendered rows, terminal and quickfix outcomes, the K3 drift notice); Troubleshooting (oracle reports no LLM service, K3 binary missing or index not ready, empty search results, check failures naming the failing gate); Recovery (nothing persistent is written by knowledge actions; `:cclose` clears quickfix, `:ToggleTerm` sessions close without side effects; page removal equals deleting the module plus the dashboard entry).
3. State the two EPIC guardrails in the runbook body: generated maps show their limits and yield no operational commands, and the dashboard performs no OpenSpec integration and no production actions.
4. Stage exactly the one touched path and commit (`dotfiles/` is gitignored, so force-add):
   ```bash
   git add -f dotfiles/nvim/runbooks/repo-knowledge.md
   git commit -m "feat(T900661): repo knowledge runbook chapter [T900661]"
   ```

### Acceptance criteria

- `dotfiles/nvim/runbooks/repo-knowledge.md` exists with the nine named steps in dashboard order plus the five required sections, prerequisites, and recovery.
- The frontmatter `actions` list matches the dashboard page order exactly, and the guardrails on maps, OpenSpec and production actions are stated.
- Commit uses the exact subject above with the explicit force-added pathspec and touches no other file.
