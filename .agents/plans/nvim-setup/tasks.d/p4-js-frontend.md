# p4 — Kapitel JavaScript / Frontend (T901047)

Tickets: T901047 (EPIC T901043). Haengt ab von: p1 (Shell, Aktionsmodell).

## Kontext

Befund K2: alte Abdeckung nur website, brett, root. Nicht abgedeckt:
VideoVault, studio-server, mentolder-web, mediaviewer-widget, `packages/*`.

## Schritt 0 — Proben

Komponentenliste zur Laufzeit aus `package.json`-Dateien ermitteln
(`find` nach `package.json`, Paketmanager je Komponente live pruefen:
website pnpM-Erwartung verifizieren, Rest npm). Task-Befehle NICHT hart
codieren — je Komponente via `bash scripts/vda.sh oracle` ermitteln und die
Anfrage im Runbook als Schritt festhalten.

## Task 1 — Aktionen und Runbook

Files:

- `dotfiles/nvim/lua/chapters/js-frontend.lua`
- `dotfiles/nvim/runbooks/js-frontend.md`

Aktionen pro Komponente: dev, test, lint, build (kein format-on-save).
Komponenten-Erkennung und Manager-Wahl laufen zur Laufzeit; unbekannte
Komponenten erscheinen mit Diagnose statt zu schweigen. Alte Datei
`lua/config/js-frontend.lua` loeschen. `runbooks/js-frontend.md` nach dem
Runbook-Vertrag.

## Akzeptanz (T901047-Checkliste)

Laufzeit-Komponentenerkennung; vier Aktionen je Komponente; Befehle via
oracle ermittelt; kein format-on-save; Runbook vorhanden.

## Pruefbefehl

```bash
nvim --headless -u NONE -c "set rtp+=dotfiles/nvim" \
  -c "lua print(table.concat(require('chapters.js-frontend').components(), ','))" -c "qa!" 2>&1 | tail -1
```

Erwartung: Komponentenliste enthaelt website und mindestens eine der bisher
nicht abgedeckten Komponenten (VideoVault, studio-server, mentolder-web,
mediaviewer-widget oder `packages/*`-Eintrag).
