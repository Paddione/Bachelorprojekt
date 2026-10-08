-- Neovim-Konfiguration — Neuaufbau (T901043, nur Neovim).
-- SSOT: Bachelorprojekt/dotfiles/nvim. Einziger Weg nach live:
-- dotfiles/install.sh, Paragraph 5.
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- lazy.nvim-Bootstrap (klont bei Bedarf, bleibt offline-fehlerfrei).
require('core.lazy').bootstrap()

-- Genau drei setup()-Aufrufe:
require('core.options').setup() -- 1: Core-Defaults (Optionen + Keymaps)
require('core.dashboard').setup() -- 2: Dashboard (Kommandos, Maps, Startscreen)
require('core.dashboard').setup_chapters() -- 3: Kapitel-Registrierung (alle Seiten)

-- Theme aus dem konsolidierten Plugin-Set (fehlerfrei ohne Plugins).
pcall(vim.cmd.colorscheme, 'tokyonight-night')
