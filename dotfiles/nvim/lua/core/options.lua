-- Editor-Defaults (T901043 p1). setup() zieht core.keymaps mit.
local M = {}

function M.setup()
  vim.opt.number = true
  vim.opt.relativenumber = true
  vim.opt.termguicolors = true
  vim.opt.expandtab = true
  vim.opt.shiftwidth = 2
  vim.opt.tabstop = 2
  vim.opt.smartindent = true
  vim.opt.ignorecase = true
  vim.opt.smartcase = true
  vim.opt.splitbelow = true
  vim.opt.splitright = true
  vim.opt.signcolumn = 'yes'
  vim.opt.updatetime = 250
  require('core.keymaps').setup()
end

return M
