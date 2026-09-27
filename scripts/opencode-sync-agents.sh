#!/usr/bin/env bash
set -euo pipefail

# scripts/opencode-sync-agents.sh
# Idempotently merges .opencode/agent-models.jsonc into ~/.config/opencode/opencode.jsonc
#
# --dry-run: berechnet den Merge und zeigt den diff gegen die Ziel-Config,
# ohne zu schreiben (Idempotenz-Check, T900162).

DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '4,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unbekanntes Argument: $1" >&2; exit 2 ;;
  esac
done

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$REPO_DIR/.opencode/agent-models.jsonc"
TARGET_FILE="${OPENCODE_CONFIG:-$HOME/.config/opencode/opencode.jsonc}"

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Error: source config $SOURCE_FILE not found." >&2
  exit 1
fi

if [[ ! -f "$TARGET_FILE" ]]; then
  mkdir -p "$(dirname "$TARGET_FILE")"
  echo '{"provider":{"lmstudio":{"models":{}}},"agent":{}}' > "$TARGET_FILE"
fi

# Strip comments starting with //
CLEAN_SRC=$(sed -E 's/^[[:space:]]*\/\/.*$//g' "$SOURCE_FILE")
CLEAN_TGT=$(sed -E 's/^[[:space:]]*\/\/.*$//g' "$TARGET_FILE")

TEMP_SRC=$(mktemp)
TEMP_TGT=$(mktemp)
TEMP_OUT=$(mktemp)
trap 'rm -f "$TEMP_SRC" "$TEMP_TGT" "$TEMP_OUT"' EXIT

# Real files instead of <(...) process substitution: Git Bash on Windows does
# not expose /proc/<pid>/fd, so jq cannot reopen those pseudo-paths. Plain
# temporary files work on Linux, macOS, Git Bash, and WSL alike.
printf '%s\n' "$CLEAN_SRC" > "$TEMP_SRC"
printf '%s\n' "$CLEAN_TGT" > "$TEMP_TGT"

jq -s '
  .[1].agent = .[0].agent |
  .[1].provider = (.[1].provider * .[0].provider) |
  .[1]
' "$TEMP_SRC" "$TEMP_TGT" > "$TEMP_OUT"

if [[ $DRY_RUN -eq 1 ]]; then
  if diff -q "$TEMP_OUT" "$TARGET_FILE" >/dev/null 2>&1; then
    echo "dry-run: no changes (idempotent)"
  else
    echo "dry-run: diff vs $TARGET_FILE:"
    diff -u "$TARGET_FILE" "$TEMP_OUT" || true
  fi
  exit 0
fi

# Permissions der Ziel-Config erhalten (T900162): mv ersetzt die Datei und
# wuerde sonst eine 600er-Config auf 644 zuruecksetzen.
if [[ -f "$TARGET_FILE" ]] && command -v stat >/dev/null 2>&1; then
  ORIG_MODE="$(stat -c %a "$TARGET_FILE" 2>/dev/null || true)"
  if [[ -n "$ORIG_MODE" ]]; then
    chmod "$ORIG_MODE" "$TEMP_OUT" 2>/dev/null || true
  fi
fi
mv "$TEMP_OUT" "$TARGET_FILE"
echo "Successfully synced agent models to $TARGET_FILE"

PROMPTS_SRC="$REPO_DIR/.opencode/prompts"
PROMPTS_TGT="$(dirname "$TARGET_FILE")/prompts"
if [[ -d "$PROMPTS_SRC" ]]; then
  mkdir -p "$PROMPTS_TGT"
  cp -f "$PROMPTS_SRC"/*.md "$PROMPTS_TGT"/ 2>/dev/null || true
  echo "Successfully synced prompt files to $PROMPTS_TGT"
fi

# T014105: Plugins analog zu den Prompts verteilen — ohne Verteilung wuerde
# der Repo-Stand in ~/.config/opencode nie ankommen und jeder Neustart verloere
# die MCP-Auth (bge-mcp-env, mcp-client-tokens-env) bzw. den Worktree-Guard.
#
# opencode laedt Plugins aus SINGULAR *und* PLURAL (agent/agents,
# skill/skills, command/commands, plugin/plugins) — siehe
# https://opencode.ai/docs/plugins/ und den customize-opencode-Skill. Empirisch
# bestaetigt: vor diesem Fix meldete der Plugin-Loader jede Datei 3x, weil sie in
# `.opencode/plugin/` (Repo-Quelle), `~/.config/opencode/plugin/` und
# `~/.config/opencode/plugins/` lag. Deshalb wird ausschliesslich nach `plugins/`
# gesynchronisiert; die veraltete globale `plugin/`-Kopie wurde entfernt.
# Kostet war CPU/Latenz, nicht Kontext (3 Guard-Spawns + 3 message-merges pro
# Edit bzw. Turn). Die Kopie traegt keine Secrets (nur Laderlogik, Tokens
# bleiben in ~/.config/*/server.env).
PLUGINS_SRC="$REPO_DIR/.opencode/plugin"
PLUGINS_TGT="$(dirname "$TARGET_FILE")/plugins"
if [[ -d "$PLUGINS_SRC" ]]; then
  mkdir -p "$PLUGINS_TGT"
  cp -f "$PLUGINS_SRC"/*.ts "$PLUGINS_TGT"/ 2>/dev/null || true
  echo "Successfully synced plugin files to $PLUGINS_TGT (opencode auto-load)"
fi
