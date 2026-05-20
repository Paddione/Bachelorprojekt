#!/usr/bin/env bash
# scripts/assets-index.sh — walk assets/ and upsert records into assets.registry.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS_DIR="$REPO_ROOT/assets"

: "${ENV:=dev}"

PGPOD=$(kubectl get pod -n workspace --context "${ENV_CONTEXT:-default}" \
  -l app=shared-db -o name 2>/dev/null | head -1)
if [[ -z "$PGPOD" ]]; then
  echo "ERROR: no shared-db pod found (context=${ENV_CONTEXT:-default})" >&2
  exit 1
fi

classify_type() {
  local ext="${1##*.}"
  ext="${ext,,}"
  case "$ext" in
    ogg|mp3|wav|flac|aac) echo "audio" ;;
    png|jpg|jpeg|webp|svg|gif|avif|ico) echo "image" ;;
    mp4|webm|mov|avi) echo "video" ;;
    *) echo "document" ;;
  esac
}

SQL_LINES=()
while IFS= read -r -d '' file; do
  rel="${file#$ASSETS_DIR/}"
  name="$(basename "$rel")"
  type="$(classify_type "$name")"
  # Escape single quotes in path/name
  rel_esc="${rel//\'/\'\'}"
  name_esc="${name//\'/\'\'}"
  SQL_LINES+=("INSERT INTO assets.registry (name, type, file_path) VALUES ('${name_esc}', '${type}', '${rel_esc}') ON CONFLICT (file_path) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = now();")
done < <(find "$ASSETS_DIR" -type f -not -name '.gitkeep' -print0)

if [[ ${#SQL_LINES[@]} -eq 0 ]]; then
  echo "No assets found in $ASSETS_DIR"
  exit 0
fi

TMPFILE=$(mktemp /tmp/assets-index-XXXXXX.sql)
printf '%s\n' "${SQL_LINES[@]}" > "$TMPFILE"

echo "Indexing ${#SQL_LINES[@]} assets into assets.registry..."
kubectl exec -i "$PGPOD" -n workspace --context "${ENV_CONTEXT:-default}" -- \
  psql -U website -d website -v ON_ERROR_STOP=1 < "$TMPFILE"

rm "$TMPFILE"
echo "✓ assets:index complete (${#SQL_LINES[@]} rows upserted)"
