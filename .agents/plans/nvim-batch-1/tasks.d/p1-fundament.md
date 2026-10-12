---
title: p1 Fundament verifizieren und haerten
ticket_id: T901044
role: impl
---

# p1 — Fundament (T901044)

Ziel: jede Checklisten-Zeile von T901044 gegen main belegen, die zwei
offenen Punkte (Live-Sicherung, T901212-Abhaengigkeit) als
Execute-Schritte festschreiben, die `lua/dashboard`-Abweichung schriftlich
begruenden. Kein Umbau ohne Beleg.

## File Structure

- `dotfiles/nvim/init.lua` (Ist 20, S1 n/a — kein .lua-Limit)
- `dotfiles/nvim/lua/core/dashboard.lua` (Ist 276, S1 n/a)
- `dotfiles/nvim/lua/core/actions.lua` (Ist 64, S1 n/a)
- `dotfiles/nvim/lua/core/gitroot.lua` (Ist 38, S1 n/a)
- `dotfiles/nvim/lua/core/lazy.lua` (Ist 67, S1 n/a)
- `dotfiles/nvim/lua/core/options.lua` (Ist 21, S1 n/a)
- `dotfiles/nvim/lua/core/keymaps.lua` (Ist 11, S1 n/a)
- `dotfiles/nvim/runbooks/index.md`, `dotfiles/nvim/runbooks/_template.md`,
  `dotfiles/nvim/runbooks/home.md` (S1 n/a)
- `dotfiles/nvim/windows/init.lua` (Ist 46, S1 n/a)
- `dotfiles/install.sh` (Ist 183, Budget 617)
- `dotfiles/nvim/SETUP_CHECKLIST.md`, `dotfiles/nvim/README.md` (S1 n/a)

## Task 1 — Live-Config sichern und Drift messen

Ausserhalb aller Config-Verzeichnisse sichern, Vergleich verifizieren,
Pfad ins Ticket schreiben:

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
cp -r ~/.config/nvim /tmp/nvim-live-backup-$STAMP
diff -rq -x lazy-lock.json dotfiles/nvim ~/.config/nvim \
  && echo "kein Drift" || echo "Drift siehe oben"
```

Erwartung: hoechstens `runbooks/models-inference.md` (ausserhalb Batch-1).
Den Backup-Pfad per Ticket-Kommentar an T901044 haengen.

## Task 2 — Kernmodule gegen Checkliste verifizieren

Je Zeile einen Beleg per Befehl erheben, keine Sichtpruefung allein:

```bash
grep -c "require('core" dotfiles/nvim/init.lua
grep -n "register" dotfiles/nvim/lua/core/dashboard.lua | head -3
grep -n "Ausfuehren" dotfiles/nvim/lua/core/actions.lua | head -3
nvim --headless -u NONE -c "set rtp+=dotfiles/nvim" \
  -c "lua print(require('core.gitroot') and 'gitroot ok')" -c "qa!" 2>&1 | tail -1
```

Belegpflicht: init-Aufrufe (3 setup), Selbstregistrierung, Zwei-Schritt,
gitroot-Meldungen. Abweichung festhalten: kein eigenes `lua/dashboard/`
-Verzeichnis — die Shell lebt in `core/dashboard.lua` (276 Zeilen, kein
Monolith). Begruendung in `runbooks/index.md` als Hinweis ergaenzen, kein
Umbau.

## Task 3 — Runbook-Vertrag und Windows-Wrapper verifizieren

```bash
grep -c "T90104\|T90105" dotfiles/nvim/runbooks/index.md
test -f dotfiles/nvim/runbooks/_template.md && echo "Vorlage ok"
grep -n "core.dashboard" dotfiles/nvim/windows/init.lua | head -3
grep -n "## Rollback" -A3 dotfiles/nvim/SETUP_CHECKLIST.md
```

Erwartung: Index deckt alle Seiten ab, Vorlage existiert, Wrapper prueft
die neue Struktur, Rollback ist dokumentiert.

## Task 4 — Abschluss

- T901212-Abhaengigkeit im Ticket vermerken (Home-Austragen laeuft
  separat, Fundament setzt es nicht voraus).
- Commit: `feat(T901044): fundament verifiziert und Abweichung begruendet`.

Pruefbefehl: `bats tests/spec/home-nvim-ssot.bats` bleibt unberuehrt;
dieses Partial prueft mit den Befehlen aus Task 2 und 3.
