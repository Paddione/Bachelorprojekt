# p2 — Editor-Faehigkeiten (T901045)

Tickets: T901045 (EPIC T901043). Haengt ab von: p1 (Kern- und Lade-Mechanik).

## Kontext

Befund I2: kein LSP-Server installiert, Treesitter-Pin veraltet, `fd` fehlt.
Befund I5: Doppelrollen snacks.picker/telescope und snacks.terminal/toggleterm.
Dieses Partial legt pro Sprache den Server fest, konsolidiert das Plugin-Set
und dokumentiert jede Entscheidung mit Ueberschneidungsvergleich.

## Schritt 0 — Proben (Annahmen aus dem Ticket sind Hypothesen)

1. `nvim --version`; installierte Server pruefen (`:checkhealth`-Vorlauf,
   `command -v` je Kandidat, Mason-Status falls vorhanden).
2. Treesitter-Branch gegen die installierte nvim-Version upstream verifizieren.
3. `command -v fd || echo "fd fehlt"` und `rg`-Verhalten als Fallback-Kandidat
   festhalten. Sprachen-Graph aus dem Repo: TypeScript, Svelte, Astro, Bash,
   YAML, HTML/CSS, Lua, Python, SQL, Go.

## Task 1 — Server, Treesitter, Completion, Konsolidierung

Files:

- `dotfiles/nvim/lua/chapters/editor.lua`
- `dotfiles/nvim/lua/plugins/core.lua`
- `dotfiles/nvim/lua/plugins/editor.lua`
- `dotfiles/nvim/runbooks/editor.md`

Pro Sprache genau ein Server mit Installationsweg (Mason oder npm/System —
als Runbook-Schritt, kein stilles Auto-Install). Treesitter auf den zu nvim
passenden Zweig. Completion: blink.cmp behalten oder ersetzen, Begruendung im
Runbook. Picker: genau eines aus snacks.picker / telescope (das andere aus
`plugins/core.lua` und `plugins/editor.lua` entfernen — I5-Doppel
aufloesen). Terminal: genau eines aus snacks.terminal / toggleterm. Alte
Datei `lua/config/editor-capabilities.lua` loeschen. `runbooks/editor.md`
nach dem Runbook-Vertrag (Aktionsnamen = Schrittnamen, gleiche Reihenfolge).

## Akzeptanz (T901045-Checkliste)

Server je Sprache festgelegt; Installationsweg als Runbook-Schritt; Treesitter
kompatibel (upstream verifiziert); Completion-Entscheid begruendet; je ein
Picker und ein Terminal; `fd`-Lage geklaert; `:checkhealth` ohne Fehler.

## Pruefbefehl

```bash
nvim --headless -u NONE -c "set rtp+=dotfiles/nvim" \
  -c "lua require('chapters.editor').checkhealth()" -c "qa!" 2>&1 | tee /tmp/p2-health.txt
! grep -i "error" /tmp/p2-health.txt
```

Erwartung: Health-Probe ohne Fehler fuer alle gewaehlten Server.
