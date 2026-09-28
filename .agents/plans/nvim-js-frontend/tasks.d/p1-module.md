## Task 1: js-frontend chapter module (navigation plus lifecycle)

Context. This partial creates the new chapter module for ticket T900658. It owns exactly one new file, creates no other file, and depends on no other partial. The module follows the `config.files-search` contract from T900657: every function resolves its working directory at execution time (optional `cwd` argument with a `config.gitroot` fallback, warning plus early return when no project root resolves), never at render time, never via `vim.fn.getcwd()`. Navigation reuses the kept Telescope pickers; lifecycle commands run through the kept ToggleTerm; the LSP/Treesitter status mirrors the server and parser names from `config.editor-capabilities` (T900656, read-only reference — that module exposes no getters, so the verified name lists live here as locals). No new plugin enters the inventory, no `BufWritePre` autocmd is defined, no OpenSpec reference appears, and the module never runs install commands.

Target files (NEW):

- `dotfiles/nvim/lua/config/js-frontend.lua` (js-frontend.lua): the chapter module exposing twelve functions in the pinned index order.

### Steps

- [ ] Create `dotfiles/nvim/lua/config/js-frontend.lua` with the module skeleton: a local `M` table, a `warn(msg)` helper prefixing `js-frontend: `, a `resolve_cwd(cwd)` helper with the files-search contract (non-empty argument wins, else `require('config.gitroot').root()`, warning plus nil when unresolvable), and a guarded `picker(name)` loader for `telescope.builtin` that warns when Telescope is not loaded yet.
- [ ] Implement the five navigation functions `goto_page`, `goto_component`, `goto_layout`, `goto_route` and `goto_design`. Each resolves `cwd` first, then calls the `find_files` picker with a distinct `prompt_title` and `search_dirs` under the resolved root: `components/website/src/pages`, `components/website/src/components`, `components/website/src/layouts`, `components/website/src/pages/api`, and the pair `design/leitstand-ds` plus `components/website/src/styles` for the design action. All five directories were verified present during scouting.
- [ ] Implement the package-boundary helper `resolve_target(bufpath)`: a buffer path under `components/website/` resolves to manager `pnpm` with dir `components/website`; under `components/brett/` to manager `npm` with dir `components/brett`; any other repo buffer resolves to manager `npm` with dir `.` (root, type-check only). The helper returns nil plus a warning for unnamed buffers. No branch of this helper may ever produce an npm command for `components/website` or a pnpm command for `components/brett`; the tests partial pins this.
- [ ] Implement the six lifecycle functions `dev`, `preview`, `lint`, `type_check`, `build` and `test_cmd` through a shared `run(target, script)` helper that opens ToggleTerm (`toggleterm.terminal`, guarded with a warning when unavailable) with `direction = 'horizontal'`, `dir` set to the resolved root, and the exact verified commands: website `pnpm --dir <root>/components/website <dev|preview|lint|astro:check|build|test>`; brett `npm --prefix <root>/components/brett run <dev|lint|typecheck|build|test>`; root `npm --prefix <root> run typecheck` for `type_check` only. `preview` on a brett buffer and `dev`/`preview`/`lint`/`build`/`test_cmd` on a root buffer warn and run nothing, because no such script exists there. Escape every path with `vim.fn.shellescape`.
- [ ] Implement `lsp_status`: collect the attached-client names via `vim.lsp.get_clients()` filtered to `ts_ls`, `astro`, `svelte`, `html` and `cssls`, probe parser presence for `astro`, `svelte`, `javascript`, `typescript`, `html` and `css` via guarded `vim.treesitter.language.add` calls, and report one summary line per language through `vim.notify`. Every probe call is guarded so the function is safe headless with zero clients installed.
- [ ] Prove the module loads cleanly headless and defines no format-on-save hook:
  ```bash
  cat > /tmp/jsf-probe.lua <<'LUA'
  package.path = 'dotfiles/nvim/lua/?.lua;' .. package.path
  local ok, m = pcall(require, 'config.js-frontend')
  assert(ok, 'load failed')
  local want = { 'goto_page', 'goto_component', 'goto_layout', 'goto_route', 'goto_design', 'dev', 'preview', 'lint', 'type_check', 'build', 'test_cmd', 'lsp_status' }
  for _, f in ipairs(want) do assert(type(m[f]) == 'function', 'missing ' .. f) end
  assert(#vim.api.nvim_get_autocmds({ event = 'BufWritePre' }) == 0, 'format-on-save leak')
  print('js-frontend module OK')
  LUA
  nvim -l /tmp/jsf-probe.lua
  ```
  The probe must print the OK line and exit 0.
- [ ] Commit the single file. `dotfiles/` is gitignored, so force-add the explicit path:
  ```bash
  git add -f dotfiles/nvim/lua/config/js-frontend.lua
  git commit -m "feat(T900658): js-frontend chapter module [T900658]"
  git ls-files dotfiles/nvim/lua/config/js-frontend.lua
  ```
  The `git ls-files` call must list the new file.

### Acceptance criteria

- `dotfiles/nvim/lua/config/js-frontend.lua` exists and exposes exactly the twelve listed functions, each resolving its directory at execution time with the nil-guard warning.
- The five navigation functions target the five verified directory sets and nothing else.
- The boundary helper maps website buffers to pnpm, brett buffers to npm, and root buffers to npm with type-check only; no code path produces npm for the website directory.
- The six lifecycle functions emit exactly the verified package script commands and warn (without running) where a script does not exist.
- `lsp_status` reports the five servers and six parsers from the T900656 set and stays silent-safe headless.
- The file defines zero `BufWritePre` autocmds, references no OpenSpec path, and runs no install command.
- The implementation commit uses the `feat(T900658): <subject> [T900658]` shape and tracks exactly the one force-added file.
