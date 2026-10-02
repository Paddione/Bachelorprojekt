-- ============================================================================
-- Neovim Configuration — nvim-dashboard-foundation (T900655)
-- ============================================================================

-- ── Leaders (must be set before any plugin loads) ──────────────────────────
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- ── Plugin Manager: lazy.nvim (stable) ─────────────────────────────────────
local lazy_path = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
if not vim.loop.fs_stat(lazy_path) then
  vim.fn.system({
    'git',
    'clone',
    '--filter=blob:none',
    'https://github.com/folke/lazy.nvim.git',
    lazy_path,
  })
  vim.fn.system({
    'git',
    '-C',
    lazy_path,
    'checkout',
    'stable',
  })
end
vim.opt.rtp:prepend(lazy_path)

-- ── Plugin Spec ─────────────────────────────────────────────────────────────
require('lazy').setup({
  { import = 'plugins.core' },
  { import = 'plugins.editor' },
  { import = 'plugins.nodectl' },
})

-- Use the theme already included in the shared plugin set.
vim.cmd.colorscheme('tokyonight-night')

-- ── Shared editor defaults ──────────────────────────────────────────────────
require('config.editor').setup()

-- ── Dashboard: registers :Dashboard and <leader>h ───────────────────────────
require('config.dashboard').setup()

-- Nodectl: node-control layer (:Node* commands, <leader>N* keymaps)
require('config.nodectl').setup()
