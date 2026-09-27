---
page: home
ticket: T900655
status: complete
actions:
  - Files & Search
  - JavaScript / Frontend
  - GitHub
  - SDLC
  - Repository & Code Knowledge
  - AI & Agents
  - Models & Inference
  - Infrastructure
  - ComfyUI & Images
  - Settings & Help
---

## Voraussetzungen

- Neovim is installed and on `PATH` (verified target: v0.12.5).
- The repo config has been installed via `dotfiles/install.sh` into
  `~/.config/nvim` (see `../README.md`).

## Geordnete Schritte

1. Start Neovim.
2. Open the Home page with `<leader>h` or `:Dashboard` if it is not
   already showing.
3. Read the chapter list: ten rows, one per chapter, in the order listed
   in this file's `actions` header and in `../README.md`.
4. Move the selection with `j` / `k` or the direct number key for a
   chapter, then press Enter (or the direct key) to move to that
   chapter's page. Selecting only focuses the page; nothing runs yet.
5. On a chapter or sub-page, select an executable action the same way to
   focus it, then run it as a separate, explicit step (the visible action
   model's `effect`, with `cwd` resolved from the current buffer's Git
   root).
6. Press `<BS>` to go back to the previous page, or `0` to return to Home
   from any page.

## Erwartetes Ergebnis

The Home page renders exactly the ten chapter rows above, each a link
row ending in a `>` marker, with no Factory row. Selecting a chapter
switches the same dashboard buffer to that chapter's page; opening the
page itself performs no shell command, file write, or other state
change.

## Troubleshooting

- **Dashboard does not appear on `<leader>h` or `:Dashboard`.** Confirm
  `snacks.nvim` loaded (`:Lazy` shows it as loaded); if not, check for a
  startup error in `:messages`.
- **Chapter list is empty or shorter than ten rows.** The dashboard
  module failed to build its page table; check `:messages` for a Lua
  error from `config.dashboard`, and confirm the config installed via
  `dotfiles/install.sh` matches this repo's `dotfiles/nvim/`.

## Recovery

If the new config causes problems, roll back to the preserved prior
config:

```bash
mv ~/.config/nvim.old-20260927 ~/.config/nvim
```
