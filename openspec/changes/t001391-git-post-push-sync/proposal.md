# Proposal: t001391-git-post-push-sync

## Why

Nach einem Amend/Re-Push divergierte der lokale `main`-Branch kurzzeitig von
`origin/main` um einen bereits vom Squash-Merge überholten Commit (Mishap aus
T001373 M1). Auslöser: der GitHub-Actions-Workflow `freshness-regen.yml` committet
und pusht bei Artefakt-Drift eigenständig direkt auf `origin/main`, während lokal
zeitgleich ein Amend/Re-Push lief. Git kennt kein natives „post-push"-Hook-Event —
`.githooks/pre-push` läuft *vor* der Übertragung und kann den tatsächlichen
Post-Push-Zustand von `origin/main` nicht beobachten. Aufgelöst wurde die konkrete
Instanz manuell mit `git reset --hard origin/main` (sicher, da der lokale
Commit-Inhalt bereits im Squash-Merge steckte). Ohne Tooling-Fix wiederholt sich
dieses manuelle Diagnose-Muster bei jedem ähnlichen Timing-Zufall.

## What

Ein neues Wrapper-Skript `scripts/git-safe-push.sh`, das nach einem erfolgreichen
`git push` auf `main` automatisch `origin/main` fetcht und den Sync-Zustand prüft:

- Bei Fast-Forward/Sync: kein Eingriff.
- Bei Divergenz mit **inhaltlich äquivalentem** lokalen Commit (per `git patch-id`
  gegen die neue `origin/main`-History geprüft — deckt genau den Squash-Merge-Fall
  ab) und **sauberem Working Tree**: automatisches `git reset --hard origin/main`
  mit Log-Ausgabe, welcher lokale Commit verworfen wurde.
- Bei Divergenz **ohne** bestätigte Inhalts-Äquivalenz: nur eine deutliche Warnung
  mit der manuellen Recovery-Anleitung — **kein** automatischer Reset, um echte
  abweichende Arbeit nie stillschweigend zu verwerfen.

Ergänzt die bestehende `divergence-guard`-Spec (bisher nur Pre-Worktree-Check in
`scripts/worktree-create.sh`) um das komplementäre Post-Push-Requirement. Der
bestehende `.githooks/pre-push`-Hook bleibt unverändert (falscher Zeitpunkt für
diese Prüfung); die `git-workflow`-Skill-Anleitung referenziert künftig
`git-safe-push.sh` statt rohem `git push` für Pushes auf `main`.

_Ticket: T001391_
