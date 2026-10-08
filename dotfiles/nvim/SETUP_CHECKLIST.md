# Setup-Checkliste (T901043)

1. Live-Config sichern (ausserhalb aller Config-Verzeichnisse):
   `cp -r ~/.config/nvim ~/.config/nvim-backup-$(date +%Y%m%d-%H%M%S)`
2. Drift pruefen:
   `diff -rq -x lazy-lock.json dotfiles/nvim ~/.config/nvim`
3. Installieren (einziger Weg nach live):
   `bash dotfiles/install.sh` (Paragraph 5; No-Op wenn aktuell, sonst
   Backup + Update; `lazy-lock.json`-Drift wird ignoriert).
4. Windows/WSL: `windows/init.lua` spiegelt die WSL-Config einmalig nach
   `%LOCALAPPDATA%\nvim-data\wsl-config` (robocopy) und laedt von dort.
5. Verifizieren: `nvim --headless -u NONE -c "set rtp+=dotfiles/nvim"`
   `-c "lua print(#require('core.dashboard').pages())" -c "qa!"`
   (Erwartung: `15`), dann `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/test_neovim_dashboard.py`.
6. Health: `:checkhealth` (Editor-Kapitel: `<leader>h`, Editor-Seite,
   `lsp-status`).

## Rollback

Backup-Pfad zurueckkopieren, Schritt fuer Schritt:
`cp -r <backup>/. ~/.config/nvim/`, Neovim neu starten, `:checkhealth`.
