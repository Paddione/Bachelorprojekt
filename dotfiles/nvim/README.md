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

## Nodectl layer (T900800)

Wiring the bare-metal node-control layer into the dashboard config:

1. `lua/config/nodectl.lua` - drop-in module: async cluster probes, binary
   checks, SETUP_CHECKLIST.md parsing, `:Node*` commands and `<leader>N*`
   keymaps.
2. `lua/plugins/nodectl.lua` - lazy specs for kubectl.nvim, ToggleTerm and
   telescope (+ plenary), each guarded by `pcall`; the spec callback calls
   `config.nodectl.setup()`.
3. `SETUP_CHECKLIST.md` - the checklist the node page renders.
4. `init.lua` adds `{ import = 'plugins.nodectl' },` to the lazy spec table
   and calls `require('config.nodectl').setup()` at startup (after
   `config.dashboard.setup()`), so `:Node*`/`<leader>N*` exist before any
   `:Kubectl`.
5. `lua/config/dashboard.lua` wires the `infrastructure-node` sub-page:
   link `n` ("Node Control") on the Infrastructure page between
   `setup-checklist` and the kept `Status` link, and the page's flat rows
   from `require('config.nodectl').node_rows(...)` - probe display rows,
   missing-binary rows, checklist rows, the explicit `r` probe-refresh and
   the `n` checklist-edit entry.

The runbook index (`runbooks/README.md`) carries the stub line for the
sub-page until its chapter content lands.

## Rollback

The previous host config was preserved before this install path existed.
To roll back:

```bash
mv ~/.config/nvim.old-20260927 ~/.config/nvim
```

## Windows wrapper

`windows/init.lua` is the tracked source of the native-Windows wrapper,
installed to `%LOCALAPPDATA%\nvim\init.lua`. It is the only Neovim
startup file on the Windows side and stays a thin pointer — a second
config would drift. All plugins, keymaps and the dashboard live in
`~/.config/nvim` on WSL (distro `k3d-dev`); the wrapper mirrors that
directory over UNC to `%LOCALAPPDATA%\nvim-data\wsl-config` with
`robocopy /MIR` at startup and loads the mirror, so one bulk copy
replaces hundreds of single reads over `\\wsl.localhost` (WSL 9P
flakiness). Install it on the Windows host with:

```powershell
Copy-Item dotfiles\nvim\windows\init.lua $env:LOCALAPPDATA\nvim\init.lua
```

Edit the WSL-side config, never the Windows copy: the mirror is
disposable and `/MIR` overwrites it on the next start. The
`filereadable(UNC .. '\\init.lua')` guard runs before the mirror, so an
unreachable WSL config leaves the previous mirror untouched instead of
mirroring an empty directory over it.

### Why `package.path` sits next to `runtimepath`

`lazy.nvim` owns the runtimepath: `require('lazy').setup()` removes
entries it does not manage. The mirror is not `stdpath('config')` on
Windows — that is the wrapper itself — so a `vim.opt.rtp:prepend(CACHE)`
alone is discarded, and every `require('config.*')` after the setup
fails with *module not found*. The dashboard then never opens while
`:Dashboard` looks registered. `package.path` is not touched by
lazy.nvim, so the wrapper sets the Lua path there as well. On WSL the
line is harmless but unnecessary: there the config *is*
`stdpath('config')` and stays in the runtimepath.

The wrapper also self-tests after loading. If `config.dashboard` is
missing from `package.loaded`, it reports `wrapper_err` instead of
silently serving a config whose modules are all unresolvable.

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

### Recorded run (2026-09-28)

Executed against the live Windows host from WSL through interop, not
from a native Windows shell. Windows nvim **0.12.3+v0.12.3**; WSL
nvim 0.12.5 for comparison.

1. `nvim --version` — `0.12.3+v0.12.3` (Windows), `0.12.5` (WSL).
2. `Get-Command nvim` — `C:\Program Files\Neovim\bin\nvim.exe`.
3. `stdpath('config')` — `C:\Users\PatrickKorczewski\AppData\Local\nvim`
   (the wrapper). Config source: `\\wsl.localhost\k3d-dev\home\patrick\.config\nvim`.
4. `:set shell?` — `cmd.exe`.
5. `dir "%LOCALAPPDATA%\nvim"` — `init.lua` present.
6. Launch — **loaded the WSL-side config** through a fresh robocopy
   mirror: `wrapper_ok=true`, `wrapper_err=none`, `:Dashboard` opens
   (`snacks_dashboard`, 12 pages), `<leader>h` → `<Cmd>Dashboard<CR>`.

Caveat: `cmd.exe` refuses the UNC working directory that WSL interop
inherits ("UNC-Pfade werden nicht unterstützt"). Launch the wrapper
from a drive-letter shell, or `pushd` a drive path first — otherwise the
launch tests nothing about the wrapper.
