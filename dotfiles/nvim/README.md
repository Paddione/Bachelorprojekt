# Neovim config (T900655)

Repo SSOT for the shared Neovim dashboard config. `dotfiles/` is
git-ignored; every file under `dotfiles/nvim/` is tracked with
`git add -f` (same convention as `dotfiles/agy`, `dotfiles/claude-code`,
`dotfiles/opencode`).

## Install

`dotfiles/install.sh` copies this directory to `~/.config/nvim` as its
nvim step (idempotent):

- Destination missing → `mkdir -p` + `cp -r`, installed.
- Destination identical to the repo source → no-op message, nothing
  changes.
- Destination present and different → the live config is moved aside to
  `~/.config/nvim-backup-<timestamp>` (`date +%Y%m%d-%H%M%S`) first, then
  replaced. A live config is never overwritten without a backup.

Run it with:

```bash
bash dotfiles/install.sh
```

## Usage

The config bootstraps lazy.nvim (stable) and loads the thirteen kept
plugins from `lua/plugins/core.lua`. `<leader>h` (or `:Dashboard`) opens
the table of contents; the ten chapters are listed in EPIC order.

Headless smoke check after any change, when `nvim` is on `PATH`:

```bash
command -v nvim >/dev/null && nvim --headless -i NONE +qa
```

Exit code `0` with no error output means the config loads cleanly.

## Rollback

The previous host config was preserved before this install path existed.
To roll back:

```bash
mv ~/.config/nvim.old-20260927 ~/.config/nvim
```

## Windows wrapper

`%LOCALAPPDATA%\nvim\init.lua` (the native-Windows wrapper, UNC path +
robocopy cache) is untouched by this change. It loads the WSL-side
config at `~/.config/nvim` and currently finds nothing there until the
install step above has run on the WSL host; after that it should load
this config. See "Manual Windows-wrapper test protocol" below for how to
verify this by hand.

## Backup directories

Discovered on the host via `ls -d ~/.config/nvim-backup* ~/.config/nvim-backups`
(2026-09-27):

- `~/.config/nvim-backup-20260925-HOSgR4` (32K) — small, dated before this
  change. Recommendation: keep for now; safe to delete pending explicit
  approval once this config has been in use for a while without needing
  it.
- `~/.config/nvim-backup-unify-sNWbBenF` (232K) — larger, named for a
  prior consolidation effort. Recommendation: keep pending approval; the
  name suggests it may hold config history worth a manual look before
  deletion.
- `~/.config/nvim-backups` (36K) — a plural sibling directory, distinct
  from the timestamped `nvim-backup-*` ones. Recommendation: keep pending
  approval; contents not inspected as part of this change.

None of these directories were deleted or modified by this change.
Deletion requires explicit user approval.

## Manual Windows-wrapper test protocol

Runs by hand on a native Windows host against `nvim.exe`. It mutates
nothing. If no Windows host is available, report the protocol as **not
run** — never as passed.

1. `nvim --version` — record the reported version.
2. `where.exe nvim` — locate the executable in use.
3. `nvim --headless -c "echo stdpath('config')" -c qa` — record the
   config path Neovim resolves.
4. `:set shell?` inside Neovim — record the configured shell.
5. `dir "%LOCALAPPDATA%\nvim"` — confirm the wrapper file exists.
6. Launch the wrapper once (`nvim` from a shell that resolves to the
   wrapper) and observe one of: it loads the newly installed WSL-side
   config, it falls back to a default config, or it serves a stale
   robocopy cache mirror. Record which one was observed.

Report the six recorded values (or "not run — no Windows host
available") alongside this change.
