# Neovim-Konfiguration (T901043, nur Neovim — kein classic Vim/gVim)

Projektbewusste Dashboard-Config. SSOT ist dieses Verzeichnis
(`Bachelorprojekt/dotfiles/nvim`); einziger Weg nach live ist
`dotfiles/install.sh`, Paragraph 5.

## Struktur

- `init.lua` — schlank: Leader, lazy-Bootstrap, drei `setup()`-Aufrufe
  (Core-Defaults, Dashboard, Kapitel-Registrierung).
- `lua/core/` — Kern: `lazy` (Plugin-Mechanik), `options` (Defaults),
  `keymaps` (Leader-Maps), `gitroot` (Buffer-Git-Root), `actions`
  (Aktionsmodell), `dashboard` (Shell: Home, Kategorieseiten, Zurueck).
- `lua/chapters/` — 15 Kapitel (Editor, Files & Search, JS/Frontend,
  GitHub, SDLC, Repo-Knowledge, AI-Agents, Models, ComfyUI, ML-Training,
  Infrastructure, MCP-Servers, User-Services, Tests-Plans, Settings-Help).
- `lua/plugins/` — konsolidiertes Set: `core.lua` (11 Plugins;
  Picker `snacks.picker`, Terminal `snacks.terminal` — telescope und
  toggleterm entfernt), `editor.lua` (Treesitter v0.9.3, lspconfig v2.9.0,
  blink.cmp v1.9.1).
- `runbooks/` — `index.md` (Master-Index), `home.md`, `_template.md`,
  je ein Runbook pro Kapitelseite.
- `windows/init.lua` — Wrapper gegen die WSL-Config (geprueft).

## Aktionsmodell

Jede Aktion `{ name, inputs, target, effect, cwd, on_error }`. Suche
fokussiert die Aktion, Ausfuehren ist ein zweiter, bestaetigter Schritt.
Kein format-on-save, keine versteckten Deployments, keine Git-Mutationen
oder Merges. Git-Root immer aus dem aktuellen Buffer.

## Querschnitt

Live-Fakten (Ports, Units, Contexts) werden zur Laufzeit geprobt, nicht
hart codiert. Windows/WSL-Routing bleibt erhalten.
