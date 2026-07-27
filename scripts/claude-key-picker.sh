#!/usr/bin/env bash
# scripts/claude-key-picker.sh — Pick a DeepSeek API key and launch Claude Code
#
# Reads the two DeepSeek keys from environments/.secrets/mentolder.yaml (git-crypt
# encrypted) and presents an interactive menu. You can also pick via the CLAUDE_KEY
# environment variable for non-interactive / one-shot use:
#
#   CLAUDE_KEY=1 bash scripts/claude-key-picker.sh          # DEEPSEEK_API_KEY (primary)
#   CLAUDE_KEY=2 bash scripts/claude-key-picker.sh          # DEEPSEEK_API_KEY_PK (personal)
#   CLAUDE_KEY=pk bash scripts/claude-key-picker.sh         # alias for 2
#   CLAUDE_KEY=primary bash scripts/claude-key-picker.sh    # alias for 1
#
# Then exports ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL and launches Claude Code.
#
# Usage:
#   bash scripts/claude-key-picker.sh
#   bash scripts/claude-key-picker.sh -p "your prompt"   # one-shot

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_FILE="${PROJECT_ROOT}/environments/.secrets/mentolder.yaml"

DEFAULT_BASE_URL="https://api.deepseek.com/anthropic"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"

# === Colors ===
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}→${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*" >&2; }
err()   { echo -e "${RED}✗${NC} $*" >&2; }
dim()   { echo -e "${DIM}$*${NC}"; }
header(){ echo -e "\n${BOLD}${CYAN}═══ $* ═══${NC}\n"; }

# === Parse YAML key-value pair (simple "KEY: \"value\"" format) ===
yaml_get() {
  local key="$1"
  grep -E "^${key}:" "$SECRETS_FILE" 2>/dev/null \
    | sed -E 's/^[^:]+:\s*"?([^"]*)"?/\1/' \
    | head -1
}

# === Read keys from secrets file ===
read_keys() {
  if [[ ! -f "$SECRETS_FILE" ]]; then
    err "Secrets file not found: ${SECRETS_FILE}"
    exit 1
  fi

  KEY_PRIMARY="$(yaml_get DEEPSEEK_API_KEY)"
  KEY_PK="$(yaml_get DEEPSEEK_API_KEY_PK)"

  if [[ -z "$KEY_PRIMARY" && -z "$KEY_PK" ]]; then
    err "Neither DEEPSEEK_API_KEY nor DEEPSEEK_API_KEY_PK found in ${SECRETS_FILE}"
    exit 1
  fi
}

# === Normalise the CLAUDE_KEY env var to a numeric choice ===
normalise_choice() {
  local raw="${1,,}"  # lowercase
  case "$raw" in
    1|primary|deepseek)         echo "1" ;;
    2|pk|personal|patrick)      echo "2" ;;
    0|c|q|cancel|quit)          echo "0" ;;
    "")                         echo "" ;;   # not set → interactive
    *)                          echo "invalid" ;;
  esac
}

# === Show menu and get choice (interactive or via CLAUDE_KEY env var) ===
choose_key() {
  local choice

  if [[ -n "${CLAUDE_KEY:-}" ]]; then
    choice="$(normalise_choice "$CLAUDE_KEY")"
    if [[ "$choice" == "invalid" ]]; then
      err "Invalid CLAUDE_KEY='${CLAUDE_KEY}'. Use: 1/primary/deepseek, 2/pk/personal/patrick, or 0/cancel"
      exit 1
    fi
    if [[ "$choice" == "0" ]]; then
      info "Cancelled via CLAUDE_KEY=0."
      exit 0
    fi
  else
    echo ""
    echo -e "  ${BOLD}${BLUE}1)${NC} ${BOLD}DEEPSEEK_API_KEY${NC}    ${DIM}(DeepSeek primary via Anthropic proxy)${NC}"
    [[ -n "$KEY_PRIMARY" ]] && echo -e "     ${DIM}${KEY_PRIMARY:0:12}...${KEY_PRIMARY: -4}${NC}" || echo -e "     ${DIM}${RED}(not set)${NC}${DIM}${NC}"
    echo ""
    echo -e "  ${BOLD}${BLUE}2)${NC} ${BOLD}DEEPSEEK_API_KEY_PK${NC} ${DIM}(Patrick's personal DeepSeek)${NC}"
    [[ -n "$KEY_PK" ]] && echo -e "     ${DIM}${KEY_PK:0:12}...${KEY_PK: -4}${NC}" || echo -e "     ${DIM}${RED}(not set)${NC}${DIM}${NC}"
    echo ""
    echo -e "  ${DIM}0) Cancel${NC}"
    echo ""

    read -r -p "$(echo -e "${CYAN}Choose a key${NC} [1/${BOLD}2${NC}/0]: ")" choice
    choice="${choice:-2}"
  fi

  case "$choice" in
    1)
      if [[ -z "$KEY_PRIMARY" ]]; then
        err "DEEPSEEK_API_KEY is not set in ${SECRETS_FILE}"
        exit 1
      fi
      API_KEY="$KEY_PRIMARY"
      info "Selected: ${BOLD}DEEPSEEK_API_KEY${NC}"
      ;;
    2)
      if [[ -z "$KEY_PK" ]]; then
        err "DEEPSEEK_API_KEY_PK is not set in ${SECRETS_FILE}"
        exit 1
      fi
      API_KEY="$KEY_PK"
      info "Selected: ${BOLD}DEEPSEEK_API_KEY_PK${NC}"
      ;;
    0|c|q)
      info "Cancelled."
      exit 0
      ;;
    *)
      err "Invalid choice: $choice"
      exit 1
      ;;
  esac

  # Show key hint (first 12 + last 4 chars)
  dim "Key:      ${API_KEY:0:12}...${API_KEY: -4}"
}

# === Check Claude binary ===
check_claude() {
  if ! command -v "$CLAUDE_BIN" &>/dev/null; then
    err "Claude CLI not found at '${CLAUDE_BIN}'."
    info "Install: npm install -g @anthropic-ai/claude-code"
    info "Or set CLAUDE_BIN to the correct path."
    exit 1
  fi
  local version
  version="$("$CLAUDE_BIN" --version 2>/dev/null || echo "unknown")"
  info "Claude Code CLI ${version} at $(command -v "$CLAUDE_BIN")"
}

# === Main ===
main() {
  header "Claude Code — Key Picker"

  read_keys
  choose_key
  check_claude

  echo ""
  BASE_URL="${DEEPSEEK_BASE_URL:-$DEFAULT_BASE_URL}"
  info "Provider: ${BASE_URL}"
  info "Model:    deepseek-chat (via DeepSeek Anthropic-compatible endpoint)"
  export ANTHROPIC_BASE_URL="$BASE_URL"
  export DEEPSEEK_API_KEY="$API_KEY"
  echo ""

  export ANTHROPIC_API_KEY="$API_KEY"

  info "Launching Claude Code..."
  echo ""

  exec "$CLAUDE_BIN" "$@"
}

main "$@"
