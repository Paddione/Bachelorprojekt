-- Konsolidiertes Kern-Plugin-Set (T901043 p2).
--
-- I5-Bereinigung: snacks.picker ist der einzige Picker (nvim-telescope
-- entfernt — die Dashboard-Suche und alle Kapitel nutzen snacks.picker),
-- snacks.terminal ist das einzige Terminal (toggleterm.nvim entfernt).
-- Begruendung: snacks.nvim ist ohnehin Pflicht (Dashboard-Rendering und
-- Suche); ein zweites Picker-/Terminal-Plugin verdoppelt nur Menge und
-- Ladezeit ohne neue Faehigkeit. Dateisuchen nutzen snacks.picker mit
-- fd-Probe und rg-Fallback (siehe chapters.files-search).
return {
  { 'lewis6991/gitsigns.nvim', event = { 'BufReadPre', 'BufNewFile' } },
  { 'Ramilito/kubectl.nvim', cmd = 'Kubectl' },
  { 'folke/lazy.nvim', version = '*' },
  { 'nvim-lualine/lualine.nvim', event = 'VeryLazy' },
  { 'nvim-tree/nvim-web-devicons', lazy = true },
  { 'nickjvandyke/opencode.nvim', dependencies = { 'folke/snacks.nvim' } },
  { 'nvim-lua/plenary.nvim', lazy = true },
  { 'folke/snacks.nvim', priority = 1000, lazy = false },
  { 'folke/tokyonight.nvim', priority = 1000, lazy = false },
  { 'folke/trouble.nvim', cmd = 'Trouble' },
  { 'folke/which-key.nvim', event = 'VeryLazy' },
}
