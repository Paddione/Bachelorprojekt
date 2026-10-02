-- Reviewed shared editing defaults (T900655).
local M = {}

function M.setup()
  local undo = vim.fn.stdpath('state') .. '/undo'
  vim.fn.mkdir(undo, 'p', 448)
  vim.opt.undodir = undo
  vim.opt.undofile = true
  vim.opt.updatetime = 300
  vim.opt.sidescrolloff = 5
  vim.opt.softtabstop = 2
  vim.opt.confirm = true

  local group = vim.api.nvim_create_augroup('SharedEditor', { clear = true })
  vim.api.nvim_create_autocmd('TextYankPost', {
    group = group,
    callback = function() vim.hl.on_yank({ timeout = 150 }) end,
  })
  vim.api.nvim_create_autocmd('FocusGained', {
    group = group,
    callback = function()
      if vim.fn.mode() == 'n' and vim.bo.buftype == '' then
        vim.cmd.checktime()
      end
    end,
  })

  local function map(lhs, rhs, desc)
    if vim.fn.maparg(lhs, 'n') == '' then
      vim.keymap.set('n', lhs, rhs, { silent = true, desc = desc })
    end
  end
  map('<leader>w', '<cmd>write<CR>', 'Save file')
  map('<leader>nh', '<cmd>nohlsearch<CR>', 'Clear search highlight')
  map('[q', '<cmd>cprevious<CR>', 'Previous quickfix entry')
  map(']q', '<cmd>cnext<CR>', 'Next quickfix entry')
  for key, direction in pairs({ h = 'h', j = 'j', k = 'k', l = 'l' }) do
    map('<C-' .. key .. '>', '<C-w>' .. direction, 'Focus window ' .. direction)
  end
end

return M
