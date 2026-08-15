#!/usr/bin/env bash
# filter-generated.sh — entfernt generierte Artefakte aus einer Pfadliste (stdin -> stdout).
#
# Regel-SSOT ist das linguist-generated-Attribut in .gitattributes. Damit wirkt jedes neue
# generierte Artefakt automatisch, sobald es seinen ohnehin vorgeschriebenen Eintrag
# bekommt — es gibt bewusst KEINE zweite Pfadliste in diesem Skript.
#
# Hintergrund (T002255): `task freshness:regenerate` schreibt 16 Artefakte, mehrere davon
# unter components/website/ und docs/. Jeder Change mit einem OpenSpec-Artefakt fasst mindestens
# components/website/src/data/openspec-status.json an. Konsumenten, die aus einem Datei-Diff eine
# Handlung ableiten (test:changed, devflow-post-merge-deploy.sh), starteten dadurch
# Playwright bzw. einen Image-Build fuer Changes ohne jeden Website-Bezug.
#
# NICHT verwenden in `task freshness:check`: dort sind genau diese Pfade der
# Pruefgegenstand, nicht Rauschen. Derselbe Pfad ist in einem Kontext Signal und im
# anderen Stoerung — die Asymmetrie ist beabsichtigt.
#
# Verwendung:
#   CHANGED=$(git diff --name-only HEAD origin/main | bash scripts/filter-generated.sh)
#
# Kein `set -o pipefail`: `grep -v` liefert Exit 1, wenn es ALLE Zeilen verwirft — genau
# der Fall bei einem Diff aus ausschliesslich generierten Dateien (freshness-regen.yml-
# Bot-Commits). Unter pipefail wuerde das den aufrufenden Task mitreissen. Das
# abschliessende `exit 0` haelt den Kontrakt "leere Ausgabe ist kein Fehler".
set -u

# git check-attr gibt "<pfad>: linguist-generated: <wert>" aus. Der Wert ist `true`
# (nicht `set`), weil .gitattributes das Attribut MIT Wert setzt (linguist-generated=true);
# `set` wird zusaetzlich akzeptiert, falls ein Eintrag das Attribut wertlos fuehrt.
git check-attr --stdin linguist-generated 2>/dev/null \
  | grep -vE ': linguist-generated: (true|set)$' \
  | sed -E 's/: linguist-generated: [^:]*$//'

exit 0
