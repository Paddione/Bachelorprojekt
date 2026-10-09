#!/usr/bin/env bash
# scripts/design-assets-inventory.sh — bounded read-only inventory of WSL design assets. [T901038]
#
# Scans the six fixed in-repo scope roots (never follows symlinks, never
# reads secrets/history/weights/caches/backups) and emits a byte-reproducible
# JSON manifest: stable ID, SHA-256, byte size, MIME type and
# extension-derived format per file, plus duplicate groups for files sharing
# one hash. Read-only apart from the manifest itself: the only write is the
# file given via --out (stdout otherwise). This script never invokes
# scripts/assets-sync.sh (destructive --delete) and performs no other writes.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SCOPE_ROOTS=(
  assets
  .design-sync
  packages/design-system
  design/leitstand-ds
  components/website/public/brand
  components/brett/public/assets
)

usage() {
  cat <<'EOF'
Usage: scripts/design-assets-inventory.sh [--out MANIFEST.json]

Bounded read-only inventory of the WSL design assets (T901038). Writes a
byte-reproducible JSON manifest to stdout, or to MANIFEST.json with --out.

Scope roots (fixed): assets/, .design-sync/, packages/design-system/,
design/leitstand-ds/, components/website/public/brand/,
components/brett/public/assets/. Symlinks are never followed; .git/,
node_modules/ and __pycache__/ are pruned; secret/history/weight/cache/
backup-like file names are skipped. File contents are only hashed and
mime-typed, never interpreted.
EOF
}

OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --out)
      [[ $# -ge 2 ]] || { echo "ERROR: --out needs a path argument" >&2; usage >&2; exit 2; }
      OUT="$2"; shift 2 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for tool in find sha256sum stat file python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "ERROR: required tool missing: $tool" >&2; exit 1; }
done

cd "$REPO_ROOT"
for root in "${SCOPE_ROOTS[@]}"; do
  [[ -d "$root" ]] || { echo "ERROR: scope root missing, refusing a silently shrunk scan: $root" >&2; exit 1; }
done

# NUL-delimited enumeration: prune VCS/dependency dirs, skip secret-, history-,
# weight-, cache- and backup-like names. No -L anywhere: symlinks are listed
# as links, never traversed (-type f only matches regular files).
scan() {
  find "${SCOPE_ROOTS[@]}" \
    \( -name .git -o -name node_modules -o -name __pycache__ \) -prune -o \
    -type f \
    ! -iname '*secret*' \
    ! -iname '*history*' \
    ! -iname '*.pt' \
    ! -iname '*.bin' \
    ! -iname '*.safetensors' \
    ! -iname '*cache*' \
    ! -iname '*backup*' \
    -print0
}

# Per file emit one NUL-separated quad: id, sha256, size, mime. Ordering is
# applied later in Python (single ordering authority, matches sorted(ids)).
stream_quads() {
  while IFS= read -r -d '' path; do
    sha="$(sha256sum -- "$path")"; sha="${sha%% *}"
    size="$(stat -c%s -- "$path")"
    mime="$(file --mime-type -b -- "$path")"
    printf '%s\0%s\0%s\0%s\0' "$path" "$sha" "$size" "$mime"
  done
}

emit_json() {
  # Program via fd 3 so stdin stays the quad stream (python3 - would eat it).
  python3 /dev/fd/3 "$OUT" 3<<'PYEOF'
import json
import os
import sys

raw = sys.stdin.buffer.read().split(b"\0")
if raw and raw[-1] == b"":
    raw.pop()
assert len(raw) % 4 == 0, f"quad stream truncated: {len(raw)} fields"

files = []
for i in range(0, len(raw), 4):
    path = os.fsdecode(raw[i])
    sha = raw[i + 1].decode("ascii")
    size = int(raw[i + 2].decode("ascii"))
    mime = raw[i + 3].decode("ascii")
    name = path.rsplit("/", 1)[-1]
    fmt = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    files.append({"id": path, "sha256": sha, "size": size, "mime": mime, "format": fmt})

files.sort(key=lambda e: e["id"])

by_hash: dict[str, list[str]] = {}
for entry in files:
    by_hash.setdefault(entry["sha256"], []).append(entry["id"])
duplicates = [
    {"sha256": sha, "members": sorted(members)}
    for sha, members in sorted(by_hash.items())
    if len(members) >= 2
]

manifest = {
    "generated_by": "scripts/design-assets-inventory.sh",
    "scope_roots": [
        "assets/",
        ".design-sync/",
        "packages/design-system/",
        "design/leitstand-ds/",
        "components/website/public/brand/",
        "components/brett/public/assets/",
    ],
    "skip_patterns": [
        ".git/", "node_modules/", "__pycache__/",
        "*secret*", "*history*", "*.pt", "*.bin", "*.safetensors",
        "*cache*", "*backup*",
    ],
    "file_count": len(files),
    "total_bytes": sum(entry["size"] for entry in files),
    "files": files,
    "duplicates": duplicates,
}

text = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
out = sys.argv[1]
if out:
    parent = os.path.dirname(out)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
else:
    sys.stdout.write(text)
PYEOF
}

scan | stream_quads | emit_json
