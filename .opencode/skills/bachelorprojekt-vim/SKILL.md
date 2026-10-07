---
name: bachelorprojekt-vim
description: 'Use to plan, create, rebuild, configure, or troubleshoot the Bachelorprojekt Neovim setup on Linux, WSL, or native Windows. Triggers on neovim, nvim, bachelorprojekt-vim, vim setup, nvim config, lua plugins, editor wiring, dashboard navigation, preserve neovim. Keeps Neovim separate from classic Vim/gVim.'
---

# Bachelorprojekt Neovim

Design and maintain a lightweight, project-aware Neovim setup. Neovim is the only target: do not create, edit, recommend, or validate classic Vim/gVim startup files (`.vimrc`, `_vimrc`, or `vimfiles/vimrc`). Keep classic Vim and Neovim distinct even when they share Vimscript syntax or the `vim` Lua namespace.

## Choose the scope

- For a focused bug or small requested setting, inspect the active config and make the smallest reversible change. Do not force a redesign workflow onto a narrow task.
- For a new repo config, a rebuild, or a dashboard redesign, follow the complete workflow below.
- Treat user decisions as required only when alternatives materially change behavior, maintenance, or risk. Otherwise state a sensible reversible default and keep going. Do not pause for approval of routine inspection, backups, documentation, or local edits already requested.

## Full design and implementation workflow

1. **Identify the actual editor and checkout.** Determine where Neovim runs, which executable and version it uses, its live config path, shell, data path, and the target checkout/worktree. Follow [environment detection](#detect-the-actual-environment). Never infer native Windows versus WSL from the agent's shell.
2. **Back up before a substantial rewrite.** Copy the entire live Neovim config to a timestamped location outside all discovered config/skill directories. Verify the copy (file list and content comparison) before editing, report its path, and review it for behavior worth migrating. A backup does not authorize deleting or replacing the original. Preserve the backup until migration is reviewed.
3. **Scout the repository and save evidence.** Read applicable `AGENTS.md`, `CLAUDE.md`, and nested instructions, then read `docs/runbooks/neovim-plugin-scouting.md` from the detected Git root. The runbook records this repo's durable findings; re-check live commands and paths because repository state changes. Use the current buffer's Git root/worktree, not a hardcoded checkout.
4. **Describe likely editor jobs from evidence.** Inventory languages, relevant workflows, local tools, generated maps, project instructions, and existing Neovim behavior. Summarize the evidence and the smallest set of useful capabilities before choosing plugins.
5. **Evaluate plugins only when needed.** Present a short comparison with purpose, concrete repo evidence, overlap with installed tools, Neovim compatibility, maintenance signals, dependencies, security/privacy effects, and costs. Verify time-sensitive compatibility against upstream documentation. Recommend a small set; install only what the requested design needs. Ask the user only when the tradeoff is material and not inferable; otherwise use the recommended reversible default.
6. **Design navigation around repository tasks.** For a dashboard, build a navigable schematic of the structural and workflow graph. Ground it in K3 architecture/code graph, the live service map, and authored workflow docs; curate a few human-facing zones instead of exposing raw graph nodes. Each zone opens a category page. Give each category at least one selected plugin as a concrete capability anchor. Search category names and actions, not source text. Show the proposed mapping and acceptance criteria before implementing when they materially affect the design.
7. **Specify category actions.** Give each useful repo action a visible control backed by its canonical command or guarded workflow, with structured inputs and a clear target/effect. Search should navigate: the first selection opens and focuses the category action; a separate selection runs it. Do not add hidden format-on-save, deployments, Git mutations, or production operations.
8. **Use the repo ticket workflow for a full new config.** Create one overarching EPIC and one linked ticket per agreed category; verify every child links to the EPIC. Do not create placeholders for undecided behavior. Follow repository instructions for branch/worktree and ticket handling. For focused changes, use the normal scope and ticket rules rather than inventing dashboard tickets.
9. **Implement modularly.** Keep user configuration separate from project configuration when the repo is meant to be shareable. Preserve personal mappings, settings, plugins, and plugin manager unless a clean rebuild is explicitly requested. Migrate only reviewed behavior that fits the agreed design. Provide a clear removal or rollback path.
10. **Verify and report.** Use the target Neovim executable, explicit config path, and relevant scenarios from [verification](#verify-and-report). Report exactly what changed, checks performed and skipped, backup path, reload/undo steps, and any runtime-only gaps.

Do not turn an undecided, material product choice into implementation. Keep independent work moving while resolving that choice; ticket scope must match the agreed behavior.

## Detect the actual environment

- Establish where Neovim runs, independently of where the agent runs: Linux/WSL Neovim and native Windows Neovim have separate executables, configuration roots, data roots, and shells.
- Inspect the target `nvim --version`. In the running editor, use `:echo $MYVIMRC`, `:scriptnames`, `:set shell?`, and `:lua print(vim.fn.stdpath('config'))` to identify the active config and execution environment. Do not infer the active config from a filename alone.
- Locate Neovim config through its own runtime: `nvim --clean --headless +'lua print(vim.fn.stdpath("config"))' +qa`. Common entry points are `~/.config/nvim/init.lua` or `init.vim` on Linux/WSL, and `$HOME/AppData/Local/nvim/init.lua` or `init.vim` on native Windows. Inspect existing Neovim candidates before creating another Neovim startup file. Never look for `.vimrc` as a fallback or use it as Neovim's config target.
- For Windows/WSL work, read [references/windows-wsl.md](references/windows-wsl.md).
- For repo languages, commands, and safe integration defaults, read [references/project-profile.md](references/project-profile.md).
- Detect the checkout or worktree from the current buffer's directory with `git -C <directory> rev-parse --show-toplevel`. `/home/patrick/Bachelorprojekt` is a known Linux checkout, not a portable constant. Read its applicable `AGENTS.md` before repository changes.

## Make focused changes

- Preserve personal Neovim mappings, settings, and plugins. Back up an existing Neovim config before substantial rewrites and report the backup path. Prefer a small, identifiable block or sourced project file that can be removed without disturbing other settings.
- For mappings, commands, filetypes, or plugins, read [references/project-profile.md](references/project-profile.md) and verify relevant repository tooling. Check mapping conflicts with `:verbose map <lhs>` or the appropriate mode-specific variant; use nonrecursive mappings unless recursion is intentional.
- Keep commands anchored to the buffer's detected Git root, including nested files and linked worktrees. Handle unnamed buffers and files outside Git gracefully; do not silently run against the last project. Prefer command-local working directories over globally changing Neovim's working directory. Quote Ex paths with `fnameescape()` and shell arguments with `shellescape()` for the actual shell; these are not interchangeable.
- Expose repository checks for deliberate invocation. Do not silently execute deployments, Git mutations, or production operations. Website uses pnpm; root and Brett use npm. Do not add format-on-save or whitespace cleanup by default.
- When plugins are requested, add the smallest set that addresses the need. Check compatibility with the installed Neovim version and preserve the existing plugin manager unless the user has agreed to a clean rebuild. Explain installation and removal. Neovim-specific APIs such as `vim.api`, `vim.system`, and `:checkhealth` are valid only when supported by the target Neovim version; do not treat them as classic Vim capabilities.

## Verify and report

- Validate changed Lua with the target Neovim executable and an explicit Neovim config path, for example `nvim --headless -u <init.lua> -i NONE +'lua assert(true)' +qa`. Validate Vimscript loaded by Neovim with `nvim --headless -u <init.vim> -i NONE -V1<temporary-log> +qa`. Inspect exit status and logs for startup errors. Use `--clean` as a clean baseline when needed; it does not validate the edited config.
- Exercise changed navigation or command construction against a nested file, a worktree when relevant, and a path containing spaces. Check quickfix results if search integration changed. Keep checks read-only; do not run project checks or deployments merely to test a mapping. GUI, clipboard, terminal-key, and interactive plugin behavior require the corresponding runtime: report any checks that could not be performed.
- Report the exact Neovim configuration files changed, checks performed, and how to reload or undo the change. State explicitly when no classic Vim/gVim config was created or modified if that could otherwise be ambiguous.

## Research carried forward

- `references/project-profile.md` preserves the repo-specific language, package-manager, check, and editor-integration findings.
- `references/windows-wsl.md` preserves the native Windows/WSL boundary, command-launch, and OpenCode installation findings.
- `docs/runbooks/neovim-plugin-scouting.md` in the detected repository is the detailed repo scouting record. Refresh its live facts during each substantial redesign instead of treating a prior snapshot as current.
