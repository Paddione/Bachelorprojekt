#!/usr/bin/env bash
# ticket-attach.sh — attach local files to a ticket via tickets.ticket_attachments.
#
# Usage:
#   scripts/ticket-attach.sh <ticket-uuid> <file> [<file> ...]
#
# Behavior:
#   - Validates extension is one of: md html jpg jpeg png gif webp mp3 wav mp4 mov webm pdf txt log
#   - Files <= MAX_INLINE_MB (default 10) are base64-encoded into data_url
#   - Larger files are skipped with a warning (upload to Nextcloud first, then INSERT manually with nc_path)
#   - Inserts one row per file into tickets.ticket_attachments on the mentolder cluster
#
# Requires kubectl context `mentolder` reachable.

set -euo pipefail

MAX_INLINE_MB="${MAX_INLINE_MB:-10}"
MAX_BYTES=$(( MAX_INLINE_MB * 1024 * 1024 ))
CTX="${TICKET_CTX:-mentolder}"
NS="${TICKET_NS:-workspace}"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <ticket-uuid> <file> [<file> ...]" >&2
  exit 2
fi

TICKET_UUID="$1"; shift

if ! [[ "$TICKET_UUID" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo "ERROR: first arg must be a ticket UUID (got: $TICKET_UUID)" >&2
  exit 2
fi

PGPOD=$(kubectl get pod -n "$NS" --context "$CTX" -l app=shared-db -o name 2>/dev/null | head -1)
if [[ -z "$PGPOD" ]]; then
  echo "ERROR: no shared-db pod found in ns=$NS ctx=$CTX" >&2
  exit 1
fi
# Strip "pod/" prefix so kubectl cp works with bare pod name
PGPOD_NAME="${PGPOD#pod/}"

mime_for() {
  case "${1,,}" in
    *.md)            echo "text/markdown" ;;
    *.html|*.htm)    echo "text/html" ;;
    *.txt|*.log)     echo "text/plain" ;;
    *.jpg|*.jpeg)    echo "image/jpeg" ;;
    *.png)           echo "image/png" ;;
    *.gif)           echo "image/gif" ;;
    *.webp)          echo "image/webp" ;;
    *.mp3)           echo "audio/mpeg" ;;
    *.wav)           echo "audio/wav" ;;
    *.mp4)           echo "video/mp4" ;;
    *.mov)           echo "video/quicktime" ;;
    *.webm)          echo "video/webm" ;;
    *.pdf)           echo "application/pdf" ;;
    *)               echo "" ;;
  esac
}

# Temp file for the data URL (written locally, then copied into the pod)
LOCAL_TMP=$(mktemp /tmp/_ticket_attach.XXXXXX)
POD_TMP="/tmp/_ticket_attach.dataurl"

cleanup() {
  rm -f "$LOCAL_TMP"
}
trap cleanup EXIT

attached=0
skipped=0

for f in "$@"; do
  if [[ ! -f "$f" ]]; then
    echo "SKIP: not a file: $f" >&2
    skipped=$((skipped+1))
    continue
  fi

  mime=$(mime_for "$f")
  if [[ -z "$mime" ]]; then
    echo "SKIP: unsupported extension: $f" >&2
    skipped=$((skipped+1))
    continue
  fi

  size=$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")
  if (( size > MAX_BYTES )); then
    echo "SKIP: $f is ${size} bytes (>${MAX_INLINE_MB} MB inline cap). Upload to Nextcloud and INSERT with nc_path instead." >&2
    skipped=$((skipped+1))
    continue
  fi

  filename=$(basename -- "$f")

  # Build the data URL in a local temp file to avoid ARG_MAX limits.
  # base64 -w0 writes no line breaks; printf avoids a trailing newline on the prefix.
  printf '%s' "data:${mime};base64," > "$LOCAL_TMP"
  base64 -w0 < "$f" >> "$LOCAL_TMP"

  # Copy the data URL file into the postgres pod.
  kubectl cp --context "$CTX" -n "$NS" \
    "$LOCAL_TMP" "${PGPOD_NAME}:${POD_TMP}"

  # Use psql \set to read the file inside the pod, then INSERT.
  kubectl exec "$PGPOD" -n "$NS" --context "$CTX" -- \
    psql -U website -d website -v ON_ERROR_STOP=1 \
    -v ticket="$TICKET_UUID" \
    -v fname="$filename" \
    -v mime="$mime" \
    -v size="$size" \
    -c "\\set data \`cat ${POD_TMP}\`
INSERT INTO tickets.ticket_attachments (ticket_id, filename, mime_type, file_size, data_url)
VALUES (:'ticket'::uuid, :'fname', :'mime', :'size'::bigint, :'data');" >/dev/null

  # Clean up the temp file inside the pod.
  kubectl exec "$PGPOD" -n "$NS" --context "$CTX" -- rm -f "$POD_TMP" 2>/dev/null || true

  echo "  ✓ attached $filename (${mime}, ${size} bytes)"
  attached=$((attached+1))
done

echo "Done: $attached attached, $skipped skipped"
