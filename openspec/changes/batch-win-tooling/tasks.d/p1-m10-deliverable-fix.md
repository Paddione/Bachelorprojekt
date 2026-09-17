# p1 — M10-Deliverable-Check falsch-negativ beheben

## Child-Ticket
- T900067: M10-Deliverable-Check ist unter Git Bash falsch-negativ: MSYS mangelt 'origin/main:<datei>'

## Problem
Der M10-Deliverable-Check (CLAUDE.md, Abschnitt M10) ueberprueft, ob geaenderte Files committet sind. Unter Windows (Git Bash/MSYS) faellt der Check durch, weil `git diff --name-only origin/main` MSYS-Pfade nicht korrekt mit `origin/main:<datei>` vergleicht.

## Tasks

### 1.1 Deliverable-Check-Pfad analysieren
- `grep -rn 'M10\|deliverable\|origin/main:' docs/CLAUDE.md`
- Den spezifischen Check finden, der falsch-negativ ausfaellt
- Reproduktionsschritte dokumentieren

### 1.2 Check unter MSYS/Windows harden
- Statt substring match (`origin/main:<datei>`) `git diff --quiet -- <path>` verwenden
- ODER: `git rev-parse --git-path` benuetzen, um Pfade kanonisch aufzulösen
- Sicherstellen, dass auch unter Git Bash/MSYS korrekt "changed" vs. "clean" unterschieden wird

### 1.3 Tests ergaenzen
- Falls nicht vorhanden: ein BATS-Test, der den Deliverable-Check validiert
- Edge-Case: file exists, uncommitted, MSYS path format

### 1.4 tests/CLAUDE.md M10-Abschnitt aktualisieren
- Dokumentieren, dass der Check unter Windows getestet sein muss
- Falls es einen neuen Guard gibt: README im M10-Abschnitt

## Acceptance Criteria
- Deliverable-Check unter Windows (Git Bash) liefert korrekte Ergebnisse (nicht falsch-negativ)
- Uncommittete, geaenderte Files werden als "changed" erkannt
- Bestehende Tests unter Linux weiter gangig

## Target Spec
- `openspec/specs/scripts.md` — delta: Deliverable-Check-Verhalten
- `openspec/specs/ci-cd.md` — delta: M10-Check-Bedingungen

## Dependencies
- Keiner — eigenständig implementierbar
