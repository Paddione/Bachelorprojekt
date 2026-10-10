---
title: p4 JS-Frontend auf Oracle-first umstellen
ticket_id: T901047
role: impl
---

# p4 — JavaScript / Frontend (T901047)

Ziel: Komponentenerkennung und Managerwahl belegen, Task-Befehle zuerst
ueber `vda.sh oracle` aufloesen (mit dokumentiertem Fallback), kein
format-on-save belegen. Haengt an p1.

## File Structure

- `dotfiles/nvim/lua/chapters/js-frontend.lua` (Ist 196, S1 n/a)
- `dotfiles/nvim/runbooks/js-frontend.md` (S1 n/a)

## Task 1 — Erkennung und Managerwahl belegen

```bash
ls -d components/VideoVault components/studio-server components/mentolder-web \
  components/mediaviewer-widget packages/*/ 2>&1
grep -n "BufWritePre\|format-on-save\|format on save" dotfiles/nvim/lua/chapters/js-frontend.lua \
  dotfiles/nvim/lua/core/options.lua; echo "format-check-rc=$?"
```

Erwartung: alle Checklisten-Komponenten existieren und werden vom
package.json-Scan gefunden; nirgends format-on-save.

## Task 2 — Oracle-first mit Fallback

`M.command` kodiert Befehle heute fest. Umstellen: erst
`bash scripts/vda.sh oracle` befragen (Task-Oracle, Zieltext je
Komponente und Art dev/test/lint/build), bei totem Daemon auf die
bestehende Konstruktion (pnpm website, sonst npm, Playwright fuer
tests/e2e) zurueckfallen und den Fallback im Runbook dokumentieren.
Der Oracle-Aufruf laeuft zur Laufzeit im Nvim-Job, nicht beim Bauen der
Seite (Seitenbau bleibt seitenffektfrei).

Verifikation (beide Wege):

```bash
bash scripts/vda.sh oracle "teste Komponente website" 2>&1 | head -3
nvim --headless -u dotfiles/nvim/init.lua \
  -c "lua print(#require('chapters.js-frontend').components() .. ' Komponenten')" -c "qa!" 2>&1 | tail -1
```

## Task 3 — Abschluss

- Runbook-Schritte dev/test/lint/build in Aktionsreihenfolge pruefen.
- Commit: `feat(T901047): oracle-first mit fallback`.
