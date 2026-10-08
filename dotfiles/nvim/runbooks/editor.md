---
page: editor
ticket: T901045
status: complete
actions:
  - lsp-status
  - treesitter-parsers
  - completion-check
  - server-install
---

## Voraussetzungen

- Plugins `nvim-treesitter` (v0.9.3), `nvim-lspconfig` (v2.9.0),
  `blink.cmp` (v1.9.1) via `:Lazy` installiert (Pins 2026-10-08
  upstream re-verifiziert).
- Picker ist `snacks.picker`, Terminal `snacks.terminal` (I5-Entscheid:
  snacks.nvim ist ohnehin Pflicht; telescope und toggleterm entfernt).
- Completion: `blink.cmp` behalten (LSP-nativ, Default-Keymap — kein
  zusaetzlicher Snippet-Stack noetig).
- `fd` vorhanden, sonst `rg`-Fallback (Probe: `command -v fd`).

## Geordnete Schritte

1. **lsp-status**: Aktion fokussieren, ausfuehren — zeigt `:checkhealth lsp`.
2. **treesitter-parsers**: Aktion ausfuehren — listet die 14 Parser
   (u.a. astro, svelte; jsonc wird auf json gemappt).
3. **completion-check**: Aktion ausfuehren — meldet ob blink.cmp geladen ist.
4. **server-install**: Aktion ausfuehren — listet fehlende Server mit
   Installationsweg (Mason oder Systempaket, z.B.
   `:MasonInstall typescript-language-server`). Kein stilles Auto-Install.

## Erwartetes Ergebnis

Pro Sprache genau ein Server (lua_ls, ts_ls, astro, svelte, html, cssls,
jsonls, yamlls, marksman, bashls). `:checkhealth` ohne Fehler; die
Headless-Probe `chapters.editor.checkhealth()` druckt je Server ok/fehlt
mit Installationshinweis.

## Troubleshooting

- **Server fehlt**: `server-install`-Hinweis folgen, danach Neovim neu starten.
- **Treesitter-Highlight fehlt**: `:TSUpdate`, Zweig v0.9.3 passt zu nvim 0.12.5.
- **Completion schweigt**: `completion-check`; blink.cmp braucht einen
  aktiven LSP-Client im Buffer.

## Recovery

Keine: dieses Kapitel installiert nichts und schreibt keine Dateien.
Server-Installs rueckgaengig via `:MasonUninstall <server>`.
