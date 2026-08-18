#!/usr/bin/env bash
# Runner-Zuordnungs-Guard — jeder Job, der self-hosted Kapazitaet anfordert, muss
# sie ueber ein Capability-Label adressieren, nie ueber den generischen Pool. [T012488]
#
# Warum universell statt namentlich: Der Guard aus T012446
# (tests/spec/ci-cd/hybrid-runner-placement.bats) prueft eine Allowlist benannter
# Jobs. Ein NEU hinzugefuegter Job steht in keiner dieser Listen und passiert ihn
# unbemerkt — genau so entstand der Zustand, den T012446 rueckgaengig machen musste.
# Dieses Skript iteriert stattdessen ueber jeden Job jeder Workflow-Datei und kehrt
# die Pruefrichtung um: nicht "stehen die bekannten Jobs richtig?", sondern
# "fordert irgendein Job unzulaessige Kapazitaet an?".
#
# Regel: `self-hosted`, `linux` und `x64` bezeichnen keine Faehigkeit. Sie matchen
# jeden registrierten self-hosted Runner, wodurch die Platzierung vom Runner-Inventar
# abhaengt statt von der Workflow-Definition.
#
# Requirement: openspec/specs/ci-cd.md — "Self-hosted Kapazitaet wird ueber
# Capability-Labels adressiert".
#
# Usage: scripts/ci/runner-placement-check.sh [<workflow-verzeichnis>]
#   Vorgabe: .github/workflows (relativ zur Repo-Wurzel). Das Argument macht den
#   Guard gegen Fixtures aufrufbar, ohne das Repository zu veraendern.
#
#   --list-capabilities [<verzeichnis>]  gibt die Deklaration aus (label|abhaengigkeit|jobs)
#   --list-requested    [<verzeichnis>]  gibt die in Workflows angeforderten
#                                        Capability-Labels aus (label<TAB>datei<TAB>job)
#
#   Beide Modi bestehen, damit scripts/ci/runner-inventory-check.sh die
#   Label-Semantik hier abfragt, statt sie zu duplizieren.
#
# Exit: 0 = keine Verstoesse, 1 = mindestens ein Verstoss, 2 = Nutzungs-/Umgebungsfehler.
# Laeuft ohne Netzzugriff — er ist in der PR-CI auch fuer Fork-PRs wirksam.
set -euo pipefail

# ── Capability-Label-Deklaration ───────────────────────────────────────────
# Einzige Fundstelle. Ein Label, das hier fehlt, laesst den Guard fehlschlagen;
# ein Label ohne benannte Abhaengigkeit ebenso.
#
#   Label      | bezeichnete lokale Abhaengigkeit        | adressierende Jobs
#   -----------+-----------------------------------------+---------------------------
#   fleet-gpu  | lokale GPU auf dem Host wsl-gpu-host     | opencode.yml, arbitration.yml
#
# Format je Zeile: <label>|<lokale abhaengigkeit>|<adressierende jobs>
_capability_declaration() {
  printf '%s\n' \
    'fleet-gpu|lokale GPU auf dem Host wsl-gpu-host|opencode.yml, arbitration.yml'
}

# Labels, die keine Faehigkeit bezeichnen — sie beschreiben nur Plattform bzw.
# Zugehoerigkeit zum Pool und matchen jeden self-hosted Runner.
_is_generic_label() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    self-hosted|linux|x64|x86|arm|arm64|macos|windows) return 0 ;;
    *) return 1 ;;
  esac
}

_declared_dependency_for() {
  local label="$1" line
  while IFS='|' read -r decl_label dep _jobs; do
    [ "$decl_label" = "$label" ] || continue
    printf '%s' "$dep"
    return 0
  done < <(_capability_declaration)
  return 1
}

command -v yq >/dev/null 2>&1 || {
  echo "runner-placement-check: yq nicht gefunden — Guard kann nicht pruefen." >&2
  exit 2
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

MODE=check
case "${1:-}" in
  --list-capabilities) MODE=list_capabilities; shift ;;
  --list-requested)    MODE=list_requested;    shift ;;
esac

WF_DIR="${1:-$REPO_ROOT/.github/workflows}"

if [ "$MODE" = list_capabilities ]; then
  _capability_declaration
  exit 0
fi

[ -d "$WF_DIR" ] || {
  echo "runner-placement-check: Workflow-Verzeichnis nicht gefunden: $WF_DIR" >&2
  exit 2
}

violations=0
checked_jobs=0

_violation() {
  local file="$1" job="$2" value="$3" reason="$4"
  echo "VERSTOSS: $(basename "$file") job '$job' -> runs-on: $value"
  echo "          $reason"
  violations=$((violations + 1))
}

shopt -s nullglob
for wf in "$WF_DIR"/*.yml "$WF_DIR"/*.yaml; do
  # Nicht parsbare Datei ist ein Befund, kein Grund zum stillen Ueberspringen.
  if ! yq -e '.' "$wf" >/dev/null 2>&1; then
    echo "VERSTOSS: $(basename "$wf") ist kein auswertbares YAML"
    violations=$((violations + 1))
    continue
  fi

  while IFS= read -r job; do
    [ -n "$job" ] || continue
    checked_jobs=$((checked_jobs + 1))

    tag="$(JOB="$job" yq -r '.jobs[strenv(JOB)]."runs-on" | tag' "$wf" 2>/dev/null || echo '!!null')"
    raw="$(JOB="$job" yq -r '.jobs[strenv(JOB)]."runs-on" | tostring' "$wf" 2>/dev/null || echo 'null')"

    case "$tag" in
      '!!null')
        # Job ohne runs-on — ruft einen reusable workflow ueber `uses:` auf.
        # Die Platzierung steht dann im aufgerufenen Workflow und wird dort geprueft.
        continue
        ;;
      '!!seq')
        mapfile -t labels < <(JOB="$job" yq -r '.jobs[strenv(JOB)]."runs-on"[]' "$wf")
        ;;
      '!!str')
        mapfile -t labels < <(JOB="$job" yq -r '.jobs[strenv(JOB)]."runs-on"' "$wf")
        ;;
      *)
        _violation "$wf" "$job" "$raw" \
          "runs-on ist weder Skalar noch Liste (${tag}) und damit nicht statisch auswertbar."
        continue
        ;;
    esac

    # Ein Ausdruck laesst die Platzierung erst zur Laufzeit entstehen. Der Guard
    # lehnt ihn ab, statt ihn still bestehen zu lassen.
    if printf '%s\n' "${labels[@]}" | grep -q '\${{'; then
      _violation "$wf" "$job" "$raw" \
        "runs-on enthaelt einen \${{ }}-Ausdruck und ist statisch nicht auswertbar."
      continue
    fi

    # Nur self-hosted Anforderungen unterliegen der Regel; GitHub-hosted Runner
    # sind die begruendungsfreie Vorgabe.
    wants_self_hosted=false
    for l in "${labels[@]}"; do
      [ "$(printf '%s' "$l" | tr '[:upper:]' '[:lower:]')" = "self-hosted" ] && wants_self_hosted=true
    done
    $wants_self_hosted || continue

    if [ "$MODE" = list_requested ]; then
      for l in "${labels[@]}"; do
        _is_generic_label "$l" && continue
        printf '%s\t%s\t%s\n' "$l" "$(basename "$wf")" "$job"
      done
      continue
    fi

    capabilities=0
    for l in "${labels[@]}"; do
      _is_generic_label "$l" && continue
      capabilities=$((capabilities + 1))
      if ! dep="$(_declared_dependency_for "$l")"; then
        _violation "$wf" "$job" "$raw" \
          "Capability-Label '$l' ist in der Deklaration im Skriptkopf nicht aufgefuehrt."
        continue
      fi
      if [ -z "${dep// /}" ]; then
        _violation "$wf" "$job" "$raw" \
          "Capability-Label '$l' ist deklariert, benennt aber keine lokale Abhaengigkeit."
      fi
    done

    if [ "$capabilities" -eq 0 ]; then
      _violation "$wf" "$job" "$raw" \
        "fordert den generischen self-hosted Pool an; kein Capability-Label benennt eine lokale Abhaengigkeit."
    fi
  done < <(yq -r '.jobs // {} | keys | .[]' "$wf" 2>/dev/null || true)
done
shopt -u nullglob

[ "$MODE" = list_requested ] && exit 0

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "runner-placement-check: $violations Verstoss(e) in $WF_DIR."
  echo "Portabel laufende Jobs gehoeren auf ubuntu-latest. Braucht ein Job lokale"
  echo "Infrastruktur, adressiert er sie ueber ein im Skriptkopf deklariertes"
  echo "Capability-Label — nicht ueber [self-hosted, linux, x64]."
  exit 1
fi

echo "runner-placement-check: $checked_jobs Job(s) in $WF_DIR geprueft, keine Verstoesse."
exit 0
