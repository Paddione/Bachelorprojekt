#!/bin/bash
set -euo pipefail

INBOX="/home/patrick/SMB-Share/movies/1_inbox"
COMPLETE="/home/patrick/SMB-Share/movies/3_complete"
EXTENSIONS="mp4 mkv avi mov wmv webm m4v"

processed=0
failed=0
skipped=0

echo "=== VideoVault Inbox Processor ==="
echo "Source:      $INBOX"
echo "Destination: $COMPLETE"
echo ""

# Count files first
total=0
for ext in $EXTENSIONS; do
  count=$(find "$INBOX" -maxdepth 1 -name "*.$ext" 2>/dev/null | wc -l)
  total=$((total + count))
done
echo "Found $total video files to process"
echo ""

for ext in $EXTENSIONS; do
  for video in "$INBOX"/*."$ext"; do
    [ -f "$video" ] || continue

    basename=$(basename "$video")
    name="${basename%.*}"

    echo "[$((processed + failed + skipped + 1))/$total] Processing: $basename"

    # Skip if destination already exists
    if [ -d "$COMPLETE/$name" ]; then
      echo "  SKIP: $COMPLETE/$name already exists"
      skipped=$((skipped + 1))
      continue
    fi

    # Create directory structure
    mkdir -p "$INBOX/$name/Thumbnails"

    # Move video into directory
    mv "$video" "$INBOX/$name/"

    videopath="$INBOX/$name/$basename"

    # Get duration for thumbnail positioning
    duration=$(ffprobe -v error -select_streams v:0 \
      -show_entries format=duration \
      -of default=noprint_wrappers=1:nokey=1 \
      "$videopath" 2>/dev/null || echo "0")

    if [ "$duration" = "0" ] || [ -z "$duration" ]; then
      echo "  WARN: Could not get duration, using 10s offset for thumbnail"
      duration="20"
    fi

    # Calculate 50% timestamp for thumbnail
    midpoint=$(echo "$duration * 0.5" | bc -l 2>/dev/null || echo "10")

    # Generate thumbnail at 50% mark
    if ffmpeg -hide_banner -loglevel error -y \
      -ss "$midpoint" \
      -i "$videopath" \
      -frames:v 1 -q:v 2 \
      "$INBOX/$name/Thumbnails/${name}_thumb.jpg" 2>/dev/null; then
      echo "  OK: thumbnail generated"
    else
      echo "  WARN: thumbnail generation failed"
    fi

    # Generate sprite (25 frames across the video)
    fps_rate=$(echo "25 / $duration" | bc -l 2>/dev/null || echo "0.1")
    if ffmpeg -hide_banner -loglevel error -y \
      -i "$videopath" \
      -vf "fps=$fps_rate,scale=160:-1,tile=25x1" \
      -frames:v 1 -q:v 2 \
      "$INBOX/$name/Thumbnails/${name}_sprite.jpg" 2>/dev/null; then
      echo "  OK: sprite generated"
    else
      echo "  WARN: sprite generation failed"
    fi

    # Move organized directory to destination
    mv "$INBOX/$name" "$COMPLETE/$name"
    echo "  DONE: moved to $COMPLETE/$name"

    processed=$((processed + 1))
  done
done

echo ""
echo "=== Complete ==="
echo "Processed: $processed"
echo "Skipped:   $skipped"
echo "Failed:    $failed"
echo "Total:     $total"
