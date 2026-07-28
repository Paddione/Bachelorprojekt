#!/usr/bin/env bash
# scripts/arbitration/apply.sh — Entscheiden und ausführen (T002423).
#
# Nimmt EINEN Cluster (Objekt, nicht Array — siehe cluster-schema.json items)
# auf stdin. Reihenfolge der Gates, jedes einzeln abbrechend:
#   1. Idempotenz  — cluster_key bereits in offenem arbitration-PR? -> skip
#   2. Risiko-Pfad — Datei matcht shared-state-paths.txt?           -> Eskalation
#   3. Confidence  — synthesize.mjs liefert confidence < 0.8?       -> Eskalation
#   4. Syntax-Gate — merged-Version pro Dateityp syntaktisch valide? -> sonst Eskalation
# Sonst: Branch, PR mit Label arbitration, Auto-Merge, Kommentare an Quell-PRs.
#
# Fail-open, ausnahmslos (design-spec "Fehlerbehandlung"): dieses Skript
# beendet sich IMMER mit Exit 0 — ein kaputter Arbiter darf die
# Merge-Pipeline nicht anhalten. Stdout trägt eine Marker-Zeile pro Ausgang
# (IDEMPOTENT / ESCALATE / APPLIED), damit Aufrufer (Workflow, Tests) den
# Ausgang ohne Exit-Code-Interpretation unterscheiden können.
#
# Env overrides (für Tests/Fixtures):
#   GH_AXI               - gh-Wrapper-Binary (Default: gh-axi)
#   TICKET_SH            - Kommando für Ticket-Erstellung (Default: scripts/ticket.sh)
#   SYNTHESIZE           - Pfad zu synthesize.mjs (Default: neben diesem Skript)
#   SHARED_STATE         - Risiko-Pfadliste (Default: scripts/factory/shared-state-paths.txt)
#   CONFIDENCE_THRESHOLD - Eskalationsschwelle (Default: 0.8)
set -uo pipefail

GH_AXI="${GH_AXI:-gh-axi}"
TICKET_SH="${TICKET_SH:-scripts/ticket.sh}"
SYNTHESIZE="${SYNTHESIZE:-$(dirname "$0")/synthesize.mjs}"
SHARED_STATE="${SHARED_STATE:-scripts/factory/shared-state-paths.txt}"
CONFIDENCE_THRESHOLD="${CONFIDENCE_THRESHOLD:-0.8}"

syntax_check() {
  local file="$1" ext="${1##*.}"
  case "$ext" in
    js | mjs) node --check "$file" >/dev/null 2>&1 ;;
    sh) bash -n "$file" >/dev/null 2>&1 ;;
    json) jq empty "$file" >/dev/null 2>&1 ;;
    bats) bash tests/unit/lib/bats-core/bin/bats --count "$file" >/dev/null 2>&1 ;;
    yaml | yml) python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" "$file" >/dev/null 2>&1 ;;
    *) return 0 ;; # unbekannter Typ: keine Prüfung möglich, gilt als bestanden
  esac
}

load_cluster() { cat; }

check_idempotent() {
  local cluster_key="$1"
  local branch="chore/merge-arbitration-${cluster_key:0:12}"
  "$GH_AXI" pr list --state open --json title,labels,headRefName 2>/dev/null | jq -e \
    --arg branch "$branch" \
    '.[] | select((.headRefName // "") == $branch)
         | select((.labels.nodes // []) | any(.name == "arbitration"))' >/dev/null 2>&1
}

check_risk_path() {
  local files_json="$1"
  [[ -f "$SHARED_STATE" ]] || return 1
  while IFS= read -r pattern; do
    pattern="${pattern%%#*}"
    pattern="$(echo -n "$pattern" | xargs || true)"
    [[ -z "$pattern" ]] && continue
    if echo "$files_json" | jq -e --arg p "$pattern" 'any(.[]; startswith($p))' >/dev/null 2>&1; then
      echo "$pattern"
      return 0
    fi
  done < "$SHARED_STATE"
  return 1
}

escalate() {
  local cluster="$1" reason="$2"
  local cluster_key files prs briefing
  cluster_key="$(jq -r '.cluster_key' <<< "$cluster")"
  files="$(jq -r '.files | join(", ")' <<< "$cluster")"
  prs="$(jq -r '[.eligible_prs[].number] | join(", ")' <<< "$cluster")"

  echo "ESCALATE cluster_key=${cluster_key} reason=${reason}"

  briefing="Merge-Arbitrierung eskaliert (${reason}).

Cluster: ${cluster_key}
Dateien: ${files}
Beteiligte PRs: ${prs}

Kein Code wurde generiert — manuelle Entscheidung nötig (Risiko-Pfad und/oder
niedrige Confidence, siehe docs/superpowers/specs/2026-07-28-merge-arbitration-design.md)."

  $TICKET_SH create --type task \
    --title "Merge-Arbitrierung eskaliert: ${cluster_key:0:12}" \
    --description "$briefing" >/dev/null 2>&1 || true

  local n
  for n in $(jq -r '.eligible_prs[].number' <<< "$cluster" 2>/dev/null); do
    "$GH_AXI" pr comment "$n" --body "Merge-Arbitrierung eskaliert (${reason}) für Cluster ${cluster_key}. Siehe Ticket." \
      >/dev/null 2>&1 || true
  done
}

apply_arbitration() {
  local cluster="$1" synthesis="$2"
  local cluster_key branch
  cluster_key="$(jq -r '.cluster_key' <<< "$cluster")"
  branch="chore/merge-arbitration-${cluster_key:0:12}"

  git rev-parse --verify "$branch" >/dev/null 2>&1 && git branch -D "$branch" >/dev/null 2>&1

  if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
    git checkout -q -b "$branch" origin/main
  else
    git checkout -q -b "$branch" main
  fi

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    local content
    content="$(jq -r --arg f "$file" '.merged[$f] // ""' <<< "$synthesis")"
    mkdir -p "$(dirname "$file")"
    printf '%s' "$content" > "$file"
    git add "$file"
  done < <(jq -r '.files[]' <<< "$cluster")

  git commit -q -m "chore(arbitration): merge-arbitration ${cluster_key:0:12} [merge-arbitration]" >/dev/null 2>&1 || true
  git push -q origin "$branch" 2>/dev/null || echo "PUSH FAILED (non-fatal) branch=${branch}" >&2

  local pr_body
  pr_body="$(jq -r --arg key "$cluster_key" '"Cluster: " + $key + "\n\n" + .rationale' <<< "$synthesis")"
  "$GH_AXI" pr create --title "merge-arbitration [${cluster_key:0:12}]" --body "$pr_body" \
    --label arbitration --base main --head "$branch" >/dev/null 2>&1 \
    || echo "PR CREATE FAILED (non-fatal)" >&2

  local n note
  while IFS=$'\t' read -r n note; do
    [[ -z "$n" ]] && continue
    "$GH_AXI" pr comment "$n" --body "$note" >/dev/null 2>&1 || true
  done < <(jq -r '.per_pr_notes // {} | to_entries[] | [.key, .value] | @tsv' <<< "$synthesis" 2>/dev/null)

  git checkout -q main >/dev/null 2>&1 || true
  echo "APPLIED cluster_key=${cluster_key} branch=${branch}"
}

main() {
  local cluster cluster_key
  cluster="$(load_cluster)"
  cluster_key="$(jq -r '.cluster_key' <<< "$cluster" 2>/dev/null)"
  if [[ -z "$cluster_key" || "$cluster_key" == "null" ]]; then
    echo "ERROR invalid cluster JSON on stdin (non-fatal, no-op)" >&2
    exit 0
  fi

  if check_idempotent "$cluster_key"; then
    echo "IDEMPOTENT cluster_key=${cluster_key}"
    exit 0
  fi

  local risk_pattern
  if risk_pattern="$(check_risk_path "$(jq '.files' <<< "$cluster")")"; then
    escalate "$cluster" "risk_path:${risk_pattern}"
    exit 0
  fi

  local synthesis
  if ! synthesis="$(node "$SYNTHESIZE" <<< "$cluster" 2>/dev/null)" || [[ -z "$synthesis" ]]; then
    escalate "$cluster" "synthesis_failed"
    exit 0
  fi
  if ! jq -e '.merged and (.confidence != null) and (.rationale != null)' >/dev/null 2>&1 <<< "$synthesis"; then
    escalate "$cluster" "synthesis_schema_invalid"
    exit 0
  fi

  local confidence
  confidence="$(jq -r '.confidence' <<< "$synthesis")"
  if (( $(echo "${confidence} < ${CONFIDENCE_THRESHOLD}" | bc -l 2>/dev/null || echo 1) )); then
    escalate "$cluster" "low_confidence:${confidence}"
    exit 0
  fi

  local file tmpfile
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    tmpfile="$(mktemp --suffix=".${file##*.}")"
    jq -r --arg f "$file" '.merged[$f] // ""' <<< "$synthesis" > "$tmpfile"
    if ! syntax_check "$tmpfile"; then
      rm -f "$tmpfile"
      escalate "$cluster" "syntax_gate:${file}"
      exit 0
    fi
    rm -f "$tmpfile"
  done < <(jq -r '.files[]' <<< "$cluster")

  apply_arbitration "$cluster" "$synthesis"
}

main "$@"
