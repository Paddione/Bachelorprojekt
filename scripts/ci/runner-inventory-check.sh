#!/usr/bin/env bash
# Runner-Inventur — gleicht die registrierten self-hosted Runner gegen die
# Capability-Labels ab, die die Workflows tatsaechlich anfordern. [T012488]
#
# Zwei Abweichungsrichtungen, beide zaehlen als Befund:
#
#   1. Registrierter Runner, den kein Job adressiert. Er traegt weiterhin die
#      generischen Labels und nimmt deshalb jeden Job an, der versehentlich auf
#      den generischen Pool gesetzt wird — unbeaufsichtigt und ohne dass ein Gate
#      anschlaegt. Ein unbenutzter Runner ist genau die Bedingung, unter der eine
#      Fehlplatzierung gelingt, statt sichtbar zu scheitern.
#   2. Angefordertes Capability-Label, das kein registrierter Runner traegt.
#      Solche Jobs stehen unbegrenzt in der Queue, ohne je zu scheitern.
#
# BEWUSST KEIN Required Check (design.md D4): der Abgleich braucht die GitHub-API
# und damit ein Token. Bei Fork-PRs gaebe es keines, der Job wuerde notwendig
# scheitern oder uebersprungen — beides macht ihn als Gate wertlos. Fail-closed ist
# stattdessen der netzfreie scripts/ci/runner-placement-check.sh, der in der
# PR-CI ueber tests/spec/ci-cd/runner-role-assignment.bats laeuft.
#
# Usage: scripts/ci/runner-inventory-check.sh
# Exit:  0 = Inventar und Workflows decken sich
#        1 = mindestens eine Abweichung
#        2 = Umgebungsfehler (gh fehlt, nicht authentisiert, API nicht erreichbar)
#
# Der Exit-Code 2 ist von 1 getrennt, damit eine fehlende Authentisierung nicht als
# "alles in Ordnung" durchgeht: eine leere Runnerliste aus einem gescheiterten
# API-Aufruf sieht sonst genauso aus wie ein sauberes Inventar.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLACEMENT_CHECK="$SCRIPT_DIR/runner-placement-check.sh"

command -v gh >/dev/null 2>&1 || {
  echo "runner-inventory-check: 'gh' nicht gefunden — Inventar nicht abfragbar." >&2
  echo "Installieren oder den Abgleich auf einem Host mit GitHub-CLI ausfuehren." >&2
  exit 2
}

if ! gh auth status >/dev/null 2>&1; then
  echo "runner-inventory-check: gh ist nicht authentisiert — Inventar nicht abfragbar." >&2
  echo "'gh auth login' ausfuehren. Ohne Authentisierung waere eine leere Runnerliste" >&2
  echo "nicht von einem sauberen Inventar zu unterscheiden." >&2
  exit 2
fi

[ -x "$PLACEMENT_CHECK" ] || [ -f "$PLACEMENT_CHECK" ] || {
  echo "runner-inventory-check: $PLACEMENT_CHECK fehlt — Label-Deklaration nicht lesbar." >&2
  exit 2
}

# ── Angeforderte Capability-Labels aus den Workflows ───────────────────────
# Quelle ist runner-placement-check.sh, damit die Label-Semantik (was zaehlt als
# Capability, was als generisch) an genau einer Stelle steht.
requested_raw="$(bash "$PLACEMENT_CHECK" --list-requested)"

declare -A requested_by=()
while IFS=$'\t' read -r label file job; do
  [ -n "${label:-}" ] || continue
  requested_by["$label"]="${requested_by[$label]:+${requested_by[$label]}, }$file:$job"
done <<< "$requested_raw"

# ── Registrierte Runner ────────────────────────────────────────────────────
if ! runners_json="$(gh api 'repos/{owner}/{repo}/actions/runners' --paginate 2>&1)"; then
  echo "runner-inventory-check: API-Abfrage fehlgeschlagen." >&2
  echo "$runners_json" >&2
  exit 2
fi

runner_lines="$(printf '%s' "$runners_json" \
  | jq -r '.runners[]? | "\(.name)\t\(.status)\t\([.labels[].name] | join(","))"')"

findings=0

echo "=== Registrierte self-hosted Runner ==="
if [ -z "$runner_lines" ]; then
  echo "(keiner)"
else
  printf '%s\n' "$runner_lines" | while IFS=$'\t' read -r name status labels; do
    printf '  %-18s %-8s %s\n' "$name" "$status" "$labels"
  done
fi

echo ""
echo "=== Von Workflows angeforderte Capability-Labels ==="
if [ "${#requested_by[@]}" -eq 0 ]; then
  echo "(keines)"
else
  for label in "${!requested_by[@]}"; do
    printf '  %-18s %s\n' "$label" "${requested_by[$label]}"
  done
fi

# Generische Labels bezeichnen keine Faehigkeit — ein Runner, der nur sie traegt,
# ist per Definition unzugewiesen.
_is_generic_label() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    self-hosted|linux|x64|x86|arm|arm64|macos|windows) return 0 ;;
    *) return 1 ;;
  esac
}

echo ""
echo "=== Abgleich ==="

# Richtung 1: Runner ohne adressierenden Job.
declare -A runner_has_label=()
while IFS=$'\t' read -r name status labels; do
  [ -n "${name:-}" ] || continue
  addressed=""
  IFS=',' read -ra label_arr <<< "$labels"
  for l in "${label_arr[@]}"; do
    runner_has_label["$l"]=1
    _is_generic_label "$l" && continue
    if [ -n "${requested_by[$l]:-}" ]; then
      addressed="${addressed:+$addressed, }$l"
    fi
  done
  if [ -z "$addressed" ]; then
    echo "UNZUGEWIESEN: Runner '$name' ($status) — Labels: $labels"
    echo "              Kein Job fordert eines seiner Capability-Labels an."
    echo "              Er nimmt aber jeden Job an, der auf den generischen Pool geraet."
    echo "              -> deregistrieren (config.sh remove) oder eine belegte Aufgabe zuweisen."
    findings=$((findings + 1))
  else
    echo "OK: Runner '$name' wird ueber '$addressed' adressiert."
  fi
done <<< "$runner_lines"

# Richtung 2: angefordertes Label ohne Runner.
for label in "${!requested_by[@]}"; do
  if [ -z "${runner_has_label[$label]:-}" ]; then
    echo "OHNE RUNNER: Label '$label' wird angefordert von ${requested_by[$label]},"
    echo "             aber kein registrierter Runner traegt es. Diese Jobs bleiben"
    echo "             unbegrenzt in der Queue, statt sichtbar zu scheitern."
    findings=$((findings + 1))
  fi
done

echo ""
if [ "$findings" -gt 0 ]; then
  echo "runner-inventory-check: $findings Abweichung(en)."
  exit 1
fi
echo "runner-inventory-check: Inventar und Workflow-Anforderungen decken sich."
exit 0
