# Shared VDA core helper library. Sourced by vda.sh and subcommands.

vda_header() {
  local title="$1" width=60
  local dashes; printf -v dashes '%*s' "$width" ''; dashes=${dashes// /─}
  echo "─── ${title} ${dashes:${#title}+4}"
}

vda_section() { echo "  • $1: $2"; }

vda_list() {
  local title="$1" i=0; shift
  echo "  $title:"
  for item in "$@"; do echo "    $((++i)). $item"; done
}

vda_error() { echo "✗ $1" >&2; }

vda_success() { echo "✓ $1"; }

vda_warn() { echo "⚠ $1"; }

vda_choose() {
  local prompt="$1" opt; shift
  if [[ "${VDA_NONINTERACTIVE:-0}" = "1" || ! -t 0 ]]; then
    [[ $# -ge 1 ]] && echo "${1}" || return 1
    return 0
  fi
  select opt in "$@"; do
    [[ -n "$opt" ]] && { echo "$opt"; return 0; }
    echo "Invalid selection." >&2
  done
}

vda_confirm() {
  local prompt="${1:-Continue?}" default="${2:-y}"
  if [[ "${VDA_NONINTERACTIVE:-0}" = "1" || ! -t 0 ]]; then
    return 0
  fi
  local ans
  read -r -p "${prompt} [${default}] " ans || true
  ans="${ans:-$default}"
  [[ "$ans" =~ ^[yYjJ] ]]
}

vda_input() {
  local prompt="$1" default="${2:-}"
  if [[ "${VDA_NONINTERACTIVE:-0}" = "1" || ! -t 0 ]]; then
    [[ -n "$default" ]] && echo "$default" || return 1
    return 0
  fi
  local ans
  local p="${prompt}"
  [[ -n "$default" ]] && p="${p} [${default}]"
  read -r -p "${p}: " ans || true
  echo "${ans:-$default}"
}

vda_exec() {
  local cmd="$1"
  echo "+ $cmd" >&2
  if [[ "${DRY_RUN:-0}" = "1" ]]; then
    echo "[DRY_RUN] would execute: $cmd"
    return 0
  fi
  eval "$cmd"
}

vda_dry_run() {
  echo "[DRY_RUN] $1"
}

vda_json() {
  local json="{"
  local first=1 pair k v
  for pair in "$@"; do
    k="${pair%%=*}"
    v="${pair#*=}"
    # Shell-escape for JSON
    v="$(printf '%s' "$v" | sed 's/"/\\"/g')"
    [[ "$first" -eq 0 ]] && json+=","
    first=0
    json+="\"${k}\":\"${v}\""
  done
  json+="}"
  if command -v jq &>/dev/null; then
    jq -c . <<<"$json" 2>/dev/null || echo "$json"
  else
    echo "$json"
  fi
}

vda_result() { vda_json "$@"; }
