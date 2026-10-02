-- Core kept plugins — exactly thirteen (T900655). Alphabetical by plugin name.
return {
  { 'lewis6991/gitsigns.nvim', event = { 'BufReadPre', 'BufNewFile' } },
  { 'Ramilito/kubectl.nvim', cmd = 'Kubectl' },
  { 'folke/lazy.nvim', version = '*' },
  { 'nvim-lualine/lualine.nvim', event = 'VeryLazy' },
  { 'nvim-tree/nvim-web-devicons', lazy = true },
  { 'nickjvandyke/opencode.nvim', dependencies = { 'folke/snacks.nvim' } },
  { 'nvim-lua/plenary.nvim', lazy = true },
  { 'folke/snacks.nvim', priority = 1000, lazy = false },
  {
    'nvim-telescope/telescope.nvim',
    cmd = 'Telescope',
    dependencies = { 'nvim-lua/plenary.nvim' },
  },
  { 'akinsho/toggleterm.nvim', cmd = 'ToggleTerm' },
  { 'folke/tokyonight.nvim', priority = 1000, lazy = false },
  { 'folke/trouble.nvim', cmd = 'Trouble' },
  { 'folke/which-key.nvim', event = 'VeryLazy' },
}
