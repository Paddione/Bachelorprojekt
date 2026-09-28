## Task p1: Wire plugins.editor into init.lua

Context. Zweck dieses Partials: den dormanten Editor-Spec in den Startup-Pfad
aufnehmen. This partial implements the wiring half of ticket T900747 (Neovim
editor capabilities dormant) for plan `nvim-editor-wiring`. It owns exactly
one line in `init.lua` and touches no other file. Verified live 2026-09-28:
`init.lua:31` imports only `plugins.core`; `lua/plugins/editor.lua` (61
lines) defines the three lazy specs (nvim-treesitter v0.9.3, nvim-lspconfig
v2.9.0, blink.cmp v1.9.1) whose `config` functions call the per-capability
setups; `M.setup()` is never called anywhere. A headless prototype with the
planned line added shows all 16 plugins in the lazy registry
(`lazy.core.config`). Target Neovim is v0.12.5 at `/usr/local/bin/nvim`.

Target files:

- `dotfiles/nvim/init.lua` (MODIFY: add the editor import line; Ist 38, .lua not S1-gated, so no numeric budget applies — stated in words on purpose and no numeric budget is claimed)

### Steps

- [x] Step 1 — Rebase onto the latest `origin/main` first, then add one line to the `lazy.setup()` block in `dotfiles/nvim/init.lua`, directly after the core import (anchor: lines 30-32, `{ import = 'plugins.core' },`): `  { import = 'plugins.editor' },`. Keep leaders, lazy bootstrap, and the `config.editor` / `config.dashboard` setup calls byte-identical. No `M.setup()` call: the lazy specs already invoke the per-capability setups at plugin load, and an eager call would emit WARN notifies before the plugins load (see `design.md` E1). Gate: `git diff` shows exactly one added line and `grep -c "import = 'plugins.editor'" dotfiles/nvim/init.lua` prints 1.
- [x] Step 2 — Stage exactly the touched path and commit (dotfiles/ is gitignored, force-add per repo convention):
  ```bash
  git add -f dotfiles/nvim/init.lua
  git commit -m "feat(T900747): wire editor plugins import into init [T900747]"
  ```

### Acceptance criteria

- [x] `init.lua` imports both `plugins.core` and `plugins.editor`; diff to `origin/main` is exactly one added line.
- [x] No other file changed; `plugins/editor.lua` and `config/editor-capabilities.lua` untouched (T900656 shipped, no revert).
