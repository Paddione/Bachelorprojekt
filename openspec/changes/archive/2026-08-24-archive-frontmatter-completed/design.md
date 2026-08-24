---
ticket_id: null
plan_ref: null
status: active
date: 2026-08-24
---

# Design: archive-frontmatter-completed

## Root Cause (belegt)

Schritt 7 (Zeile ~392-406) führt den Sed **vor** der Archiv-Subshell aus und schreibt damit
in `$REPO_DIR/$PLAN_FILE` — den Arbeitsbaum, in dem das Skript läuft (Zeile 41: `cd "$REPO_DIR"`).
Die Subshell von Schritt 8 wechselt in `ARCHIVE_DIR` und dort per
`git checkout -B "$ARCHIVE_BRANCH" origin/main` auf einen Frischstand von origin/main:

- `ARCHIVE_DIR == WORKTREE`: der Sed traf den Haupt-Checkout, die Subshell archiviert den
  unveränderten Stand aus origin/main → `status: active` im Archiv + uncommittete Änderung
  im Haupt-Checkout (der beobachtete pull --ff-only-Blocker).
- `ARCHIVE_DIR == REPO_DIR` (kein Worktree): der Sed landet zufällig im selben Baum wie die
  Subshell → checkout übernimmt die lokale Änderung, der Archiv-Commit enthält `completed`.
  Genau die 3 von 12 korrekten Fälle.

## Entscheidungen

| Frage | Entscheidung | Quelle |
|---|---|---|
| Fix forward oder Backfill? | **Fix forward only**, Altlasten dokumentiert stehen lassen | Klärungsbeschluss ticket-ops 2026-08-24 (User) |
| Feld für Archive abschaffen? | Nein — Feld behält seinen Zweck für künftige Archive | dito |
| Wo läuft der Sed? | In der Archiv-Subshell, nach dem `checkout -B`, vor `archive`/Resume-Commit | Root Cause |
| Testbarkeit | DB-freier Einstieg `--frontmatter-state <slug>` nach dem `--archive-state`-Muster (T015783) | tests/CLAUDE.md Output-Verifikation |

## Umfangsabgrenzung

- Kein Umbau der Schritt-7-Warnpfade (`PLAN_FILE`-Auflösung bleibt).
- Resume-Pfad: auch dort wird das Frontmatter gesetzt — auf die bereits verschobene Datei
  unter `openspec/changes/archive/`, bevor der Resume-Commit entsteht.
- Die 9 falschen Altlast-Einträge im Archiv werden NICHT angefasst.

## Risiken

- Der Sed darf nicht mehr mit `|| true` still fehlschlagen, wenn die Datei fehlt — fehlt sie
  auf dem Archiv-Branch, ist das der bestehende T004269-Fall (Plan nur im Branch-Commit) und
  wird wie bisher als [warn]/Skip behandelt, nicht als Fehler.
