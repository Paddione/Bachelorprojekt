#!/usr/bin/env bash
set -euo pipefail

# Script for managing the installation of llama.vim
# Usage:
#   scripts/vim/install-llama.sh --install [--mode copy|link] [--dry-run]
#   scripts/vim/install-llama.sh --remove [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/editor/llama-vim"

ACTION=""
MODE="copy"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install)
      ACTION="install"
      shift
      ;;
    --remove)
      ACTION="remove"
      shift
      ;;
    --mode)
      if [[ $# -lt 2 ]]; then
        echo "Error: --mode requires an argument (copy|link)" >&2
        exit 1
      fi
      MODE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "Error: Unknown argument '$1'" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ACTION" ]]; then
  echo "Usage: $0 --install [--mode copy|link] [--dry-run] | --remove [--dry-run]" >&2
  exit 1
fi

HOME_DIR="${HOME:-}"
if [[ -z "$HOME_DIR" ]]; then
  echo "Error: HOME environment variable is not set" >&2
  exit 1
fi

TARGET_PACK_DIR="$HOME_DIR/.vim/pack/bachelorprojekt/opt/llama-vim"
VIMRC_PATH="$HOME_DIR/.vimrc"

LOADER_BEGIN="\" BEGIN llama.vim loader"
LOADER_END="\" END llama.vim loader"

LOADER_BLOCK="$LOADER_BEGIN
set runtimepath^=$TARGET_PACK_DIR
packadd! llama-vim
$LOADER_END"

do_install() {
  echo "Installing llama.vim package (mode=$MODE, dry_run=$DRY_RUN)..."

  if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "Error: Source package directory not found at '$SOURCE_DIR'" >&2
    exit 1
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[DRY-RUN] Would create directory: $HOME_DIR/.vim/pack/bachelorprojekt/opt"
    echo "[DRY-RUN] Would deploy package to: $TARGET_PACK_DIR (mode: $MODE)"
    echo "[DRY-RUN] Would update configuration in: $VIMRC_PATH"
    return 0
  fi

  # Deploy package directory
  mkdir -p "$HOME_DIR/.vim/pack/bachelorprojekt/opt"
  if [[ -d "$TARGET_PACK_DIR" || -L "$TARGET_PACK_DIR" ]]; then
    rm -rf "$TARGET_PACK_DIR"
  fi

  if [[ "$MODE" == "link" ]]; then
    ln -s "$SOURCE_DIR" "$TARGET_PACK_DIR"
  else
    cp -r "$SOURCE_DIR" "$TARGET_PACK_DIR"
  fi

  # Process .vimrc configuration
  if [[ -f "$VIMRC_PATH" ]]; then
    if grep -qF "$LOADER_BEGIN" "$VIMRC_PATH"; then
      echo "Loader block already present in $VIMRC_PATH; skipping vimrc edit."
    else
      TIMESTAMP="$(date +%Y%m%d%H%M%S)"
      BACKUP_PATH="$HOME_DIR/.vimrc.backup.$TIMESTAMP"
      cp "$VIMRC_PATH" "$BACKUP_PATH"
      echo "" >> "$VIMRC_PATH"
      echo "$LOADER_BLOCK" >> "$VIMRC_PATH"
      echo "Created backup at $BACKUP_PATH and updated $VIMRC_PATH"
    fi
  else
    echo "$LOADER_BLOCK" > "$VIMRC_PATH"
    echo "Created $VIMRC_PATH with loader block"
  fi
}

do_remove() {
  echo "Removing llama.vim package (dry_run=$DRY_RUN)..."

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[DRY-RUN] Would remove package directory: $TARGET_PACK_DIR"
    echo "[DRY-RUN] Would strip loader block or restore backup for: $VIMRC_PATH"
    return 0
  fi

  if [[ -d "$TARGET_PACK_DIR" || -L "$TARGET_PACK_DIR" ]]; then
    rm -rf "$TARGET_PACK_DIR"
    echo "Removed package directory $TARGET_PACK_DIR"
  fi

  if [[ -f "$VIMRC_PATH" ]]; then
    if grep -qF "$LOADER_BEGIN" "$VIMRC_PATH"; then
      # Check if backup exists
      BACKUP_FILE="$(find "$HOME_DIR" -maxdepth 2 -name ".vimrc.backup.*" | head -n 1)"
      if [[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]]; then
        # Restore backup if content matches loader addition
        cp "$BACKUP_FILE" "$VIMRC_PATH"
        rm -f "$BACKUP_FILE"
        echo "Restored original $VIMRC_PATH from backup"
      else
        # Strip loader block surgically
        TEMP_VIMRC="$(mktemp)"
        awk -v b="$LOADER_BEGIN" -v e="$LOADER_END" '
          $0 == b { skip=1; next }
          $0 == e { skip=0; next }
          !skip { print }
        ' "$VIMRC_PATH" > "$TEMP_VIMRC"
        mv "$TEMP_VIMRC" "$VIMRC_PATH"
        echo "Stripped loader block from $VIMRC_PATH"
      fi
    fi
  fi
}

if [[ "$ACTION" == "install" ]]; then
  do_install
elif [[ "$ACTION" == "remove" ]]; then
  do_remove
fi
