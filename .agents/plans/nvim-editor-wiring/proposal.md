# Proposal: nvim-editor-wiring (T900747)

## Warum

`plugins/editor.lua` (T900656, shipped) ist dormant: `init.lua` importiert
nur `plugins.core`, kein Startup-Pfad kennt Treesitter/LSP/Blink. Die
BATS-Suite (75/75 gruen) prueft das Modul nur isoliert und haette den
Dormant-Zustand nie entdeckt.

## Was

1. `dotfiles/nvim/init.lua`: `{ import = 'plugins.editor' }` in
   `lazy.setup()` aufnehmen (eine Zeile neben dem Core-Import).
2. `tests/spec/neovim-dashboard.bats`: Headless-Wiring-Test mit Dateipuffer —
   Lazy-Registry enthaelt nvim-treesitter, nvim-lspconfig, blink.cmp;
   Startup Exit-0, keine Errors, `BufWritePre=0`. Guards wie Bestand
   (`nvim`-Skip in `setup()`, Netzwerk-Skip per `git ls-remote`).

## Nicht-Ziele

Kein Revert und keine Aenderung an `plugins/editor.lua` und
`config/editor-capabilities.lua`; keine Runbook-Aenderung; kein
`M.setup()`-Call im Startup-Pfad (wuerde WARN-Notifies erzeugen, s.
`design.md` E1).

## Akzeptanz

Ticket-Akzeptanz 1:1 (s. `design.md` Akzeptanz-Mapping). Implementierungsplan
ausschliesslich in `tasks.md`.
