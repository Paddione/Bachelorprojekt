#!/usr/bin/env bash
# plan-touched-files.sh — leitet die beruehrten Dateien aus dem `## File Structure`-Block
# eines Implementierungsplans ab und schreibt sie zeilenweise auf stdout.
#
# Warum: `touched_files` speist die Kollisionspruefung in scripts/factory/conflict-check.sh.
# Gesetzt wurde die Spalte bisher erst in dev-flow-execute Schritt 1.5, und dort konditional
# ("Falls der Plan die beruehrten Dateien kennt"). Der Plan kennt sie immer — `## File Structure`
# ist plan-lint Hard Rule STRUCT1. Die Information lag also beim Stagen bereits zwingend vor,
# haing aber an einem Prosa-Satz in einer Anleitung statt an Code. [T002446]
#
# Drei Formate sind im Bestand (33 Plaene unter openspec/changes/ ausgezaehlt):
#   1. Code-Fence mit NEW:/CHANGED:-Gruppenkoepfen   (23)
#   2. Bullet-Liste mit Backtick-Pfaden               (~7)
#   3. Markdown-Tabelle mit Backtick-Pfaden           (~3)
#
# Nicht jeder Eintrag ist ein Repo-Pfad: openspec/changes/fix-arena-db-url-secrets fuehrt unter
# dieser Ueberschrift `deployment/arena-server in namespace workspace-korczewski` — eine
# Cluster-Ressource. Deshalb wird gefiltert statt blind uebernommen.
#
# Verwendung: plan-touched-files.sh <planfile>
# Exit: 0 immer, wenn die Datei lesbar ist (leere Ausgabe + stderr-Hinweis, wenn nichts
#       ableitbar ist — stage-plan soll daran nicht scheitern, plan-lint STRUCT1 ist das
#       Gate fuer Plan-Struktur). 2 bei Aufruffehler.

set -uo pipefail

PLAN="${1:-}"
if [[ -z "$PLAN" ]]; then
  echo "Usage: ${0##*/} <planfile>" >&2
  exit 2
fi
if [[ ! -f "$PLAN" ]]; then
  echo "ERROR: Plandatei '$PLAN' nicht gefunden." >&2
  exit 2
fi

# Sektionsgrenze wie in scripts/plan-lint.sh: ab `## File Structure` bis zum naechsten H2,
# damit H3-Untergliederungen (`### New files`) Teil der Sektion bleiben. Bewusst eine Kopie
# und kein Import — plan-lint.sh ist ein fail-closed CI-Gate ohne Bibliotheks-Charakter, eine
# geteilte Funktion wuerde stage-plan an dessen Lebenszyklus koppeln.
section="$(awk '/^##[[:space:]]+File Structure/{f=1;next} f&&/^##[[:space:]]/{exit} f{print}' "$PLAN")"

if [[ -z "${section//[[:space:]]/}" ]]; then
  echo "WARN: ${PLAN}: kein '## File Structure'-Abschnitt oder leer — keine touched_files ableitbar." >&2
  exit 0
fi

# Kandidaten sammeln:
#   a) Backtick-Spans — deckt Bullet- und Tabellenform ab.
#   b) Erstes Token je Zeile — deckt die Fence-Form ab (`  pfad — beschreibung`).
# Gruppenkoepfe (NEW:, CHANGED:, DELETED:) und Fence-Marker fallen hier schon raus.
candidates="$(
  {
    printf '%s\n' "$section" | grep -o '`[^`]\+`' | tr -d '`'
    printf '%s\n' "$section" \
      | sed -e 's/^[[:space:]]*//' \
      | grep -v '^```' \
      | grep -v '^[A-Z][A-Z]*:[[:space:]]*$' \
      | awk '{print $1}'
  } 2>/dev/null | sed -e 's/[[:space:]]*$//' -e 's/[,;:]$//' -e 's/^`//' -e 's/`$//'
)"

# Filtern. Die drei Regeln entstanden am realen Bestand, nicht am Reissbrett — ein Lauf gegen
# die 33 Plaene unter openspec/changes/ foerderte zutage, was Fixtures nicht hergeben:
#   - blosse Extension-Tokens (`.sh`, `.md`) aus S1-Budget-Tabellen im selben Abschnitt,
#   - Basenames aus Prosa (`queue.sh`, `factory.service`) ohne Verzeichnisanteil,
#   - Fragmente echter Pfade (`specs/database.md` statt `openspec/specs/database.md`).
# Deshalb reicht "hat eine Extension" nicht: ein neuer Pfad muss zusaetzlich einen
# Verzeichnisanteil haben, dessen erster Bestandteil im Repo existiert.
declare -A seen=()
out=()
while IFS= read -r cand; do
  [[ -n "$cand" ]] || continue
  [[ "$cand" == *" "* ]] && continue          # Prosa-Fragment
  [[ "$cand" == \`* || "$cand" == *\` ]] && continue   # unbalancierter Backtick-Rest
  [[ -n "${seen[$cand]:-}" ]] && continue
  keep=0
  if git ls-files --error-unmatch -- "$cand" >/dev/null 2>&1; then
    keep=1                                     # getrackte Datei — staerkster Beleg
  elif [[ "$cand" == */ && -d "$cand" ]]; then
    keep=1                                     # Verzeichnis-Eintrag (conflict-check matcht Praefixe)
  elif [[ "$cand" == */* && "$cand" =~ \.[A-Za-z0-9]{1,10}$ ]]; then
    # Neue, noch nicht getrackte Datei. Der erste Pfadbestandteil muss ein existierendes
    # Verzeichnis sein, sonst ist es ein Prosa-Fragment wie `specs/database.md`.
    [[ -d "${cand%%/*}" ]] && keep=1
  fi
  if [[ $keep -eq 1 ]]; then
    seen[$cand]=1
    out+=("$cand")
  fi
done <<<"$candidates"

if [[ ${#out[@]} -eq 0 ]]; then
  echo "WARN: ${PLAN}: '## File Structure' nennt keinen ableitbaren Repo-Pfad." >&2
  exit 0
fi

# Stabil sortiert, damit touched_files reproduzierbar ist.
printf '%s\n' "${out[@]}" | sort -u
exit 0
