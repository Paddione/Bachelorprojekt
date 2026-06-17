#!/usr/bin/env bash
# scripts/vda/factory/slots.sh — Thin wrapper around scripts/factory/slots.sh.
# Delegates slot logic to the SSOT and formats output as plaintext (default)
# or JSON (--json / VDA_JSON=1).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../../.." && pwd)"
source "${REPO}/scripts/lib/vda-core.sh"

cmd="${1:-help}"; shift || true

brand="${BRAND:-}"
json_mode="${VDA_JSON:-0}"
remaining_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --brand) brand="$2"; shift 2 ;;
    --brand=*) brand="${1#*=}"; shift ;;
    --json) json_mode=1; shift ;;
    --) shift; remaining_args+=("$@"); break ;;
    *) remaining_args+=("$1"); shift ;;
  esac
done

set -- "${remaining_args[@]}"

case "$cmd" in
  help)
    vda_header "VDA factory slots"
    echo "Usage: vda.sh factory slots <action> [args]"
    echo ""
    echo "Actions:"
    echo "  count                    Show occupied slots for this brand"
    echo "  next                     Show lowest free slot"
    echo "  claim <ext_id> <n>       Claim slot n for external_id"
    echo "  release <ext_id>         Release slot for external_id"
    exit 0
    ;;
esac

rc=0
out=$(BRAND="$brand" bash "${REPO}/scripts/factory/slots.sh" "$cmd" "$@") || rc=$?

if [[ "$json_mode" = "1" ]]; then
  case "$cmd" in
    count|next)
      vda_json action="$cmd" brand="$brand" value="$out"
      ;;
    claim)
      if [[ "$rc" -eq 0 ]]; then
        vda_json action=claim brand="$brand" ext_id="${1:-}" slot="$out" ok=true
      else
        vda_json action=claim brand="$brand" ext_id="${1:-}" ok=false error="$out"
      fi
      ;;
    release)
      vda_json action=release brand="$brand" value="$out"
      ;;
  esac
else
  case "$cmd" in
    count)
      vda_section "Belegte Slots" "$out"
      ;;
    next)
      vda_section "Naechster freier Slot" "${out:---}"
      ;;
    claim)
      if [[ "$rc" -eq 0 ]]; then
        vda_success "Slot $out fuer ${1:-} belegt"
      else
        vda_error "$out"
      fi
      ;;
    release)
      vda_success "$out"
      ;;
  esac
fi

exit "$rc"
