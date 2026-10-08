---
page: settings-help
ticket: T901058
status: complete
actions:
  - lazy-ui
  - whichkey-help
  - checkhealth
  - config-recovery
---

## Voraussetzungen

- Plugins geladen (`:Lazy` zeigt lazy.nvim; sonst Warnung).

## Geordnete Schritte

1. **lazy-ui**: Plugin-UI oeffnen (`:Lazy`).
2. **whichkey-help**: Keymap-Hilfe oeffnen (`:WhichKey`).
3. **checkhealth**: `:checkhealth` fahren.
4. **config-recovery**: Vorhandene `nvim-backup-*`-Verzeichnisse werden
   zur Laufzeit gesucht (`~/.config`, `/tmp/opencode`) — Backup waehlen,
   Wiederherstellung nach den Recovery-Schritten unten. K10-Pfade auf
   geloeschte Backups sind damit ersetzt.

## Erwartetes Ergebnis

Lazy/which-key/checkhealth erreichbar; Recovery auf realem Backup-Pfad.

## Troubleshooting

- **Kein Backup gefunden**: Backup anlegen —
  `cp -r ~/.config/nvim ~/.config/nvim-backup-$(date +%Y%m%d-%H%M%S)`.
- **Drift unklar**: `diff -rq -x lazy-lock.json dotfiles/nvim ~/.config/nvim`.

## Recovery

Backup-Pfad zurueckkopieren, Schritt fuer Schritt:
`cp -r <backup>/. ~/.config/nvim/`, danach Neovim neu starten und
`:checkhealth` fahren.
