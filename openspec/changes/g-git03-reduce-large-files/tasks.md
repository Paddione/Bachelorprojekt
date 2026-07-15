---
ticket: T001828
health_goal: G-GIT03
---

# Tasks: G-GIT03 Dateien >1MB reduzieren

## Task 1: .gitignore um docs-content-built ergänzen

**Datei:** `.gitignore`

Zeile `k3d/docs-content-built/` hinzufügen. Build-Output wird dadurch nicht mehr getrackt.

**Verify:**
1. `git status` zeigt gelöschte Dateien aus `k3d/docs-content-built/`
2. `find . -size +1M -not -path './.git/*' | wc -l` zeigt ≤6

## Task 2: Legacy-HTML prüfen und aufräumen

**Datei:** `docs/legacy-html/`

Prüfen ob die Dateien noch referenziert werden. Wenn nicht: löschen und `.gitignore` um `docs/legacy-html/` ergänzen.

**Verify:**
1. `grep -r "legacy-html" . --include="*.md" --include="*.yaml" --include="*.yml"` zeigt keine Treffer (oder nur Selbstreferenzen)
2. `find . -size +1M -not -path './.git/*' | wc -l` zeigt ≤6

## Task 3: Git-Index aktualisieren

**Datei:** — (Git-Operation)

`git rm --cached` für die ausgeschlossenen Dateien, dann committen.

**Verify:**
1. `git diff --cached --stat` zeigt nur Löschungen
2. `find . -size +1M -not -path './.git/*' | wc -l` zeigt Ergebnis
