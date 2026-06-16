# scripts/factory/build-loop.sh — bounded self-correcting build-loop decision helper.
# SOURCE-only (no shebang, not executable). Shared contract with build-loop.cjs.
# Usage: source scripts/factory/build-loop.sh
# Defines: build_loop_sig_hash, build_loop_decide, build_loop_feedback
# No DB/API imports (S2).

_BUILD_LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

build_loop_sig_hash() {
  local log_file="${1:-}"
  if [[ ! -f "$log_file" ]]; then
    echo ""
    return 0
  fi
  sed -E -e 's|/home/[^/]+/[^ ]+|<PATH>|g' \
      -e 's|/tmp/wt-[^/ ]+|<WT>|g' \
      -e 's|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[^ ]*|<TS>|g' \
      -e 's|\[[0-9]*m?s\]||g' \
      -e 's|^ +||;s| +$||' \
      "$log_file" | grep -v '^$' | sha256sum | cut -d' ' -f1
}

build_loop_decide() {
  local iteration="$1"
  local max_val="$2"
  local prev_hash="$3"
  local classify="$4"
  local touched_csv="$5"
  local hash="$6"

  [[ -z "$max_val" || "$max_val" -le 0 ]] && max_val=3

  case "$classify" in
    ci|test|lint|freshness) ;;
    *) echo "abort:escalate-gate"; echo "$hash"; return 0 ;;
  esac

  if [[ -n "$touched_csv" ]]; then
    if [[ -f "${_BUILD_LOOP_DIR}/classify-paths.sh" ]]; then
      source "${_BUILD_LOOP_DIR}/classify-paths.sh"
      if paths_are_escalate_class "$touched_csv"; then
        echo "abort:escalate-gate"
        echo "$hash"
        return 0
      fi
    fi
  fi

  if [[ -n "$prev_hash" && -n "$hash" && "$prev_hash" == "$hash" ]]; then
    echo "abort:no-progress"
    echo "$hash"
    return 0
  fi

  if [[ "$iteration" -ge "$max_val" ]]; then
    echo "abort:max-iterations"
    echo "$hash"
    return 0
  fi

  echo "continue"
  echo "$hash"
  return 0
}

build_loop_feedback() {
  local classify="$1"
  local log_file="$2"
  local attempts_file="$3"

  echo "FAILURE CLASS: $classify"

  if [[ -n "$log_file" && -f "$log_file" ]]; then
    echo "LOG TAIL:"
    tail -30 "$log_file"
  fi

  if [[ -n "$attempts_file" && -f "$attempts_file" ]]; then
    local ac=0
    while IFS= read -r line || [[ -n "$line" ]]; do
      ac=$((ac + 1))
      echo "  $ac. $line"
    done < "$attempts_file"
    if [[ "$ac" -gt 0 ]]; then
      echo "PREVIOUS ATTEMPTS ($ac):"
    fi
  fi

  echo "Diagnose systematically, make the smallest possible fix, re-run tests."
}
