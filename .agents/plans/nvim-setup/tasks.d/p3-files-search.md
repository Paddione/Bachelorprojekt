# p3 — Kapitel Files & Search (T901046)

Tickets: T901046 (EPIC T901043). Haengt ab von: p2 (Picker-Entscheid),
p1 (Shell, Aktionsmodell).

## Kontext

Befund K1: Kapitel funktioniert, `fd` fehlt. Alle Aktionen werden auf das in
p2 gewaehlte Picker-Plugin umgestellt; keine eigene Picker-Logik hier.

## Task 1 — Aktionen und Runbook

Files:

- `dotfiles/nvim/lua/chapters/files-search.lua`
- `dotfiles/nvim/runbooks/files-search.md`

Aktionen: Datei finden, Repo-grep, zuletzt geoeffnet, Buffer, Worktree-weite
Suche. Jede Aktion nutzt `gitroot` aus p1 (cwd = Buffer-Root) und das
p2-Picker-Plugin; `fd`-Abwesenheit wird zur Laufzeit erkannt (`executable()`-
Probe) und faellt auf den dokumentierten Standard zurueck. Alte Datei
`lua/config/files-search.lua` loeschen. `runbooks/files-search.md` nach dem
Runbook-Vertrag.

## Akzeptanz (T901046-Checkliste)

Alle fuenf Aktionen vorhanden und registriert; Picker aus p2; Runbook mit
gleichen Namen und Reihenfolge.

## Pruefbefehl

```bash
nvim --headless -u NONE -c "set rtp+=dotfiles/nvim" \
  -c "lua print(table.concat(require('chapters.files-search').actions(), ','))" -c "qa!" 2>&1 | tail -1
```

Erwartung: genau die fuenf Aktionsnamen, kommagetrennt.
