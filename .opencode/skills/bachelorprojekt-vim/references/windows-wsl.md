# Windows and WSL

Read this when the agent, editor, or checkout crosses the Windows/WSL boundary.

## Identify the target

In PowerShell, use `Get-Command nvim -ErrorAction SilentlyContinue` to locate native Neovim and `[Environment]::GetFolderPath('UserProfile')` for the Windows profile. Neovim's own `$HOME`, `$MYVIMRC`, `:scriptnames`, and `:set shell?` determine its active configuration. A WSL agent's `$HOME` is not the Windows profile. Do not probe or modify classic Vim/gVim startup files as Neovim configuration.

A native Windows Neovim process needs Windows paths and Windows-accessible executables. WSL Neovim needs Linux paths and tools installed in the selected distribution. Check `git`, `rg`, `task`, and the relevant package manager in the editor's execution environment, not just the agent's shell.

Use `wslpath -w` or `wslpath -u` inside the relevant distribution when conversion is needed. Do not blindly replace slashes: drive mounts and WSL UNC paths differ. Discover distributions with `wsl.exe --list --quiet`; do not hardcode a distribution name.

## Repository commands

The repository's Bash scripts normally run in Linux/WSL. If native Windows Neovim must call them, use an explicit `wsl.exe --distribution <name> --cd <Linux-root> ...` boundary and test argument handling with a harmless command first. Avoid constructing several nested shell command strings. UNC working directories and cmd.exe do not behave like normal drive paths; use the explicit WSL working directory for Linux tasks.

Changing Neovim's `shell` globally affects all plugins and external commands. Prefer a scoped wrapper when only project commands need WSL. Never copy a Linux Neovim config wholesale into Windows without checking paths, shell quoting, and executable availability. Do not copy or create a `.vimrc` for this purpose.

## Making this skill available to OpenCode

OpenCode discovers the repo copy at `.opencode/skills/bachelorprojekt-vim/SKILL.md` whenever its working directory is inside this Git worktree. The repo also projects the same source through `.agents/skills` and `.claude/skills`; keep the registered copies in sync. This is the preferred scope for a Bachelorprojekt-specific skill.

For use outside this repo, OpenCode can load a global skill from `~/.config/opencode/skills/bachelorprojekt-vim/SKILL.md` in the profile of the process running OpenCode. Resolve that profile on Windows for native Windows OpenCode; a WSL Codex installation does not automatically install the skill into Windows. If OpenCode uses an overridden config directory, inspect `opencode debug paths` before choosing the destination.

Copy the complete skill folder, including references, when installing globally. Preserve an existing destination with a backup outside discovered skill directories before replacing differing files. Avoid duplicate skill IDs unless intentionally overriding one. Copying creates a snapshot; later source edits require another sync.

Restart an existing OpenCode session after changing a skill if it still shows a stale skill list. If discovery fails, check the skill path and exact `name`, YAML frontmatter, duplicate IDs, and the selected agent's `skill` permissions before changing global configuration. The repo skill was confirmed loadable from the project path through OpenCode's native `skill` tool.

Discovery reference: https://opencode.ai/docs/skills/
