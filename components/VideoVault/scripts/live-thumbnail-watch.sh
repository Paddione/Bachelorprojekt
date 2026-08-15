#!/bin/bash
# Live thumbnail generation using generate-thumbnails.mjs directly (no API needed)
# Usage: ./scripts/live-thumbnail-watch.sh [directory] [--concurrency=4] [--overwrite]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

DEFAULT_DIR="/home/patrick/projects/SMB-Symlinks/SDD-Share/movies/1_inbox"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Parse arguments
DIR_ARG=""
CONCURRENCY=4
OVERWRITE=false

for arg in "$@"; do
  case $arg in
    --concurrency=*)
      CONCURRENCY="${arg#*=}"
      ;;
    --overwrite)
      OVERWRITE=true
      ;;
    -h|--help)
      echo "Usage: $0 [directory] [--concurrency=N] [--overwrite]"
      echo ""
      echo "Generate thumbnails for .mp4 files, then package each video + thumb + sprite"
      echo "into a named folder and move it one level up (out of the inbox)."
      echo ""
      echo "Options:"
      echo "  directory          Directory to scan (default: $DEFAULT_DIR)"
      echo "  --concurrency=N    Number of parallel ffmpeg workers (default: 4)"
      echo "  --overwrite        Regenerate existing thumbnails"
      echo ""
      echo "Examples:"
      echo "  $0                                    # Scan default inbox"
      echo "  $0 /media/videos                      # Scan custom directory"
      echo "  $0 /media/videos --concurrency=8      # 8 parallel workers"
      echo "  $0 --overwrite                        # Regenerate all thumbs"
      exit 0
      ;;
    *)
      if [ -z "$DIR_ARG" ]; then
        DIR_ARG="$arg"
      fi
      ;;
  esac
done

TARGET_DIR="${DIR_ARG:-$DEFAULT_DIR}"

# Validate
if [ ! -d "$TARGET_DIR" ]; then
  echo -e "${RED}Error: Directory not found: $TARGET_DIR${NC}"
  exit 1
fi

# Check ffmpeg
if ! command -v ffmpeg &>/dev/null || ! command -v ffprobe &>/dev/null; then
  echo -e "${RED}Error: ffmpeg and ffprobe are required. Install with: brew install ffmpeg${NC}"
  exit 1
fi

# Count files first
FILE_COUNT=$(find "$TARGET_DIR" -type f -iname "*.mp4" 2>/dev/null | wc -l)

echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║           VideoVault Thumbnail Generator                      ║${NC}"
echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Directory:${NC}   $TARGET_DIR"
echo -e "${BOLD}Files:${NC}       $FILE_COUNT .mp4 files found"
echo -e "${BOLD}Concurrency:${NC} $CONCURRENCY workers"
echo -e "${BOLD}Overwrite:${NC}   $OVERWRITE"
echo ""

if [ "$FILE_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}No .mp4 files found in $TARGET_DIR${NC}"
  exit 0
fi

# Build args for generate-thumbnails.mjs
ARGS=("$TARGET_DIR" "--concurrency=$CONCURRENCY" "--no-recursive")
if [ "$OVERWRITE" = true ]; then
  ARGS+=("--overwrite")
fi

echo -e "${GREEN}Starting thumbnail generation...${NC}"
echo ""

# Run the Node.js script directly
node "$SCRIPT_DIR/generate-thumbnails.mjs" "${ARGS[@]}"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo -e "${RED}${BOLD}Thumbnail generation failed (code $EXIT_CODE)${NC}"
  exit $EXIT_CODE
fi

# Organize: create per-video folders and move up one directory
PARENT_DIR="$(dirname "$TARGET_DIR")"
THUMBS_DIR="$TARGET_DIR/Thumbnails"
MOVED=0
FAILED=0

echo ""
echo -e "${BOLD}Organizing files into named directories...${NC}"

for video in "$TARGET_DIR"/*.mp4; do
  [ -f "$video" ] || continue

  basename="${video##*/}"
  name="${basename%.*}"

  thumb="$THUMBS_DIR/${name}-thumb.jpg"
  sprite="$THUMBS_DIR/${name}-sprite.jpg"

  # Only organize if both thumbnails exist
  if [ ! -f "$thumb" ] || [ ! -f "$sprite" ]; then
    echo -e "  ${YELLOW}[skip]${NC} $name (missing thumbnails)"
    ((FAILED++)) || true
    continue
  fi

  # Create named directory in parent
  dest="$PARENT_DIR/$name"
  if [ -d "$dest" ]; then
    echo -e "  ${YELLOW}[skip]${NC} $name (directory already exists in parent)"
    ((FAILED++)) || true
    continue
  fi

  mkdir -p "$dest"
  mv "$video" "$dest/"
  mv "$thumb" "$dest/"
  mv "$sprite" "$dest/"

  echo -e "  ${GREEN}[ok]${NC} $name -> $(basename "$PARENT_DIR")/$name/"
  ((MOVED++)) || true
done

# Clean up empty Thumbnails dir
rmdir "$THUMBS_DIR" 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}Done! Moved $MOVED video(s) to $(basename "$PARENT_DIR")/${NC}"
if [ "$FAILED" -gt 0 ]; then
  echo -e "${YELLOW}$FAILED file(s) skipped${NC}"
fi
