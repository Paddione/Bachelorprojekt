# P4 — Archive-Freshness (T003136)

Rolle: **impl**. Fix für T003136: `cmd_archive` regeneriert nach dem Move zwar
`openspec-status-map.sh`, staged/committet das Artefakt aber nicht —
`website/src/data/openspec-status.json` fehlte im Archive-Commit (PR #4083, Freshness-Gate rot).

## File `scripts/openspec.sh` (geändert)

### Task P4.1 — cmd_archive staged das Status-Artefakt

- [ ] In `cmd_archive` direkt nach dem `openspec-status-map.sh`-Aufruf (Zeile ~291,
      `>/dev/null 2>&1 || true`): die Regenerierung NICHT mehr vollständig schlucken —
      Exit-Code prüfen (fail-closed: schlägt die Regenerierung fehl, bricht archive ab)
      und das Artefakt stagen:
      `git -C "$REPO" add website/src/data/openspec-status.json` (Pfad exakt der
      Status-Map-Ausgabe; beim Umsetzen gegen `openspec-status-map.sh` verifizieren).
- [ ] Nur stagen, wenn die Datei im Repo existiert (git-crypt/Worktree-Edge: `[[ -f ]]`-Guard
      vor `git add`, sonst Fehler auf unverändertem Artefakt vermeiden).
- [ ] `TICKET_OFFLINE=1`-Pfad verhält sich identisch (kein Ticket-Zugriff nötig fürs Stagen).
- [ ] Kein Commit durch `cmd_archive` selbst — der Commit bleibt Sache des Skills/Operators;
      das Stagen garantiert, dass der folgende `git commit` (auch mit expliziten Pathspecs)
      das Artefakt nicht verliert, solange der Operator `git add`-Rest oder `git commit -a`
      vermeidet — der Skill-Schritt P4.2 deckt das ab.

## File `.opencode/skills/openspec-archive-change/SKILL.md` (geändert)

### Task P4.2 — Pflicht-Schritt „Status-Artefakt im Archive-Commit"

- [ ] Nach dem Schritt „Perform the archive" (Move) einen neuen Pflicht-Schritt ergänzen:
      „Status-Artefakt committen" — regeneriertes `website/src/data/openspec-status.json`
      prüfen (`git status --short website/src/data/openspec-status.json`), bei
      staged/unstaged als Teil des Archive-Commits einbeziehen; fehlt die Datei im
      Commit-Entwurf, VOR dem Commit melden (freshness-Gate-Fehler aus PR #4083 als
      Negativbeispiel zitieren).
- [ ] Hinweis ergänzen, dass `scripts/openspec.sh archive` das Artefakt seit P4.1 bereits
      staged — der Schritt ist die Agenten-seitige Verifikation, nicht die Regenerierung.
- [ ] `.claude/skills/openspec-archive-change/`-Pendant prüfen — existiert keins, entfällt
      der Sync (beim Umsetzen verifizieren und im Commit-Body vermerken).

### Task P4.3 — Verifikation (konkrete Test-Schritte)

S1-Budget: `scripts/openspec.sh` — S1-Restbudget 383 (kleine, lokale Ergänzung in
cmd_archive bleibt weit unter dem Limit); `.opencode/skills/openspec-archive-change/SKILL.md`
ist nicht S1-gemessen (unbaselined).

- [ ] Test-Schritt A: Temp-Repo-Fixture (siehe P7.4) — nach `OPENSPEC_ROOT=… TICKET_OFFLINE=1
      bash scripts/openspec.sh archive <fixture> --no-merge` ist
      `website/src/data/openspec-status.json` im Git-Index (oder unstaged Modifikation).
- [ ] Test-Schritt B: `grep -qF "openspec-status.json"
      .opencode/skills/openspec-archive-change/SKILL.md` — Pflicht-Schritt verankert.
- [ ] Test-Schritt C: `bash -n scripts/openspec.sh` — keine Syntaxfehler; `task
      test:openspec` bleibt grün (kein Verhaltensbruch am archive-Pfad).
