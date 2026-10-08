-- Globale Leader-Maps (T901043 p1). Dashboard-eigene Maps (<leader>h,
-- <leader>hf) setzt core.dashboard.setup; hier nur generische Maps.
local M = {}

function M.setup()
  vim.keymap.set('n', '<leader>w', '<cmd>write<CR>', { desc = 'Save buffer', silent = true })
  vim.keymap.set('n', '<leader>q', '<cmd>quit<CR>', { desc = 'Quit window', silent = true })
  vim.keymap.set('n', '<leader>e', '<cmd>Explore<CR>', { desc = 'File explorer', silent = true })
end

return M
