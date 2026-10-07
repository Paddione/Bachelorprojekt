# p5 — Kapitel GitHub + Kapitel SDLC (T901048, T901049)

Tickets: T901048, T901049 (EPIC T901043). Haengt ab von: p1.

## Kontext

K3 funktioniert mit `gh`, enthaelt aber eine Merge-Aktion (`gh pr merge
--squash`) — unvereinbar mit Merge-als-Abschluss und Auto-Merge: ersatzlos
streichen. K4 kennt `ticket.sh` und `plan-lint.sh`; es fehlen devflow-mcp
`plan_stage`, `agent-lock.sh`, `agent-msg.sh`, `plan-runner.mjs`,
`vda.sh cfr` und das CI-Gate-Trio.

## Schritt 0 — Proben

`gh --version`, `gh auth status`; `gh-axi`-Anzeige gegen `gh --json`-/`-q`-
Parsen abgrenzen (T004612). Ticket-CLIs live verifizieren (`ticket.sh
get/list`, `agent-lock.sh list/mine`, `agent-msg.sh read --unread`,
`plan-lint.sh --help`); `task --list` muss `test:changed`,
`freshness:check`, `freshness:regenerate` enthalten.

## Task 1 — GitHub-Kapitel (T901048)

Files:

- `dotfiles/nvim/lua/chapters/github.lua`
- `dotfiles/nvim/runbooks/github.md`

Aktionen: PR anzeigen, Kommentare, Checks, fehlgeschlagene Runs mit Log,
Release anzeigen. Keine Merge-Aktion. Anzeige via `gh-axi`, maschinelles
Parsen via `gh` direkt. Alte Datei `lua/config/github.lua` loeschen.
Runbook nach dem Vertrag.

## Task 2 — SDLC-Kapitel (T901049)

Files:

- `dotfiles/nvim/lua/chapters/sdlc.lua`
- `dotfiles/nvim/runbooks/sdlc.md`

Aktionen: Ticket anzeigen/suchen, eigene Claims, Nachrichten, Plan linten,
Plan-Review rendern, CI-Gate lokal, CFR anzeigen. Nur lesende oder lokal
pruefende Aktionen — kein `stage-plan`, `release-hold` oder Statuswechsel aus
dem Editor (mutierende Schritte hoechstens als kopierbares Kommando). Alte
Datei `lua/config/sdlc.lua` loeschen. Runbook nach dem Vertrag.

## Akzeptanz

GitHub: fuenf Aktionen ohne Merge; T004612-Trennung eingehalten. SDLC:
sieben Aktionen, alle lesend/lokal; Runbooks beider Kapitel vorhanden.

## Pruefbefehl

```bash
nvim --headless -u NONE -c "set rtp+=dotfiles/nvim" \
  -c "lua print(#require('chapters.github').actions(), #require('chapters.sdlc').actions())" -c "qa!" 2>&1 | tail -1
```

Erwartung: Ausgabe `5  7`.
