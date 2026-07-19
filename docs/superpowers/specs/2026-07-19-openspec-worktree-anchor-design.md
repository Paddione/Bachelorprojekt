---
ticket_id: T001997
plan_ref: openspec/changes/openspec-worktree-anchor/tasks.md
status: active
date: 2026-07-19
---

# openspec.sh / openspec-status-map.sh: cwd-basierte statt pfad-basierte Repo-Erkennung

## Root Cause

`scripts/openspec.sh` und `scripts/openspec-status-map.sh` leiten ihren Repo-Root so her:

```sh
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
```

Das verankert `REPO` am **physischen Pfad, mit dem das Skript aufgerufen wurde** — nicht am
tatsächlichen Arbeitsverzeichnis des Aufrufers. In einem Worktree-Setup (`.worktrees/<slug>/`)
hat jeder Worktree eine eigene Kopie von `scripts/`. Wird das Skript mit einem falschen
relativen Pfad aufgerufen (z.B. `../../scripts/openspec.sh` aus `.worktrees/<slug>/` heraus —
das navigiert zwei Ebenen nach oben ins **Haupt-Repo-Root**, nicht zurück in den Worktree),
läuft das Skript mit `REPO`=Haupt-Checkout, obwohl der Aufrufer sich korrekt im Worktree
befand (`$PWD` war richtig). Ergebnis: `openspec propose` legt `openspec/changes/<slug>/`
im **falschen Checkout** an — genau das in `CLAUDE.local.md` dokumentierte Anti-Pattern
(mutierende Kommandos gehören nie ins Haupt-Checkout, T001880-Vorfall).

Selbst erlebt bei T001995 (Plan-Erstellung): `bash ../../scripts/openspec.sh propose ...`
aus `.worktrees/t1995-.../` heraus legte die Change-Artefakte im Haupt-Checkout an. Sofort
bemerkt und bereinigt (Ticket T001997, Mishap-Bundle).

## Fix-Ansatz

`REPO` über den **cwd-Git-Toplevel** ableiten (`git rev-parse --show-toplevel`), nicht über
den Skript-Aufrufpfad. Das macht das Skript unabhängig davon, mit welchem relativen oder
absoluten Pfad es aufgerufen wird — solange das Arbeitsverzeichnis des Aufrufers korrekt im
gewünschten Checkout (Worktree oder Hauptrepo) liegt, landet auch `REPO` dort. `HERE`
(Verzeichnis der Sibling-Skripte wie `openspec-status-map.sh`) wird konsistent aus `$REPO/scripts`
abgeleitet statt aus `dirname "${BASH_SOURCE[0]}"`, damit Sibling-Aufrufe (`openspec-status-map.sh`)
denselben Checkout treffen.

## Edge Cases

- cwd ist kein Git-Repo (z.B. Test-Fixture ohne `.git`) → `git rev-parse --show-toplevel`
  schlägt fehl → klarer Fehler statt stiller Fallback auf einen falschen Pfad.
- `OPENSPEC_ROOT`-Override (für Tests gegen Fixtures) bleibt unverändert respektiert — der
  Fix ändert nur die `REPO`-Herleitung, nicht das nachgelagerte `OPENSPEC_ROOT`-Verhalten.

## Nicht im Scope

- Andere selbst-lokalisierende Skripte im Repo (`worktree-create.sh`, `ticket.sh`, etc.)
  wurden nicht auf dasselbe Muster geprüft — dieser Fix ist auf die beiden Skripte begrenzt,
  die den konkreten Vorfall verursacht haben.
