#!/usr/bin/env bash
# git-crypt-guard.sh — verify that managed secret blobs are git-crypt-encrypted.
#
# A git-crypt-encrypted blob begins with the 10-byte magic header:
#   \x00 G I T C R Y P T \x00   (hex: 00 47 49 54 43 52 59 50 54 00)
#
# Usage:
#   git-crypt-guard.sh is-encrypted <file>   # exit 0 iff <file> begins with the header
#   git-crypt-guard.sh check-staged          # scan staged managed files (pre-commit hook)
#   git-crypt-guard.sh check-tracked         # scan all tracked managed files (CI)
#
# Exit codes: 0 = all good, 1 = a plaintext managed secret found, 2 = usage error.
set -euo pipefail

# Hex of the git-crypt magic header; compared against the first 10 bytes.
MAGIC_HEX='00474954435259505400'

# Is the path one we require to be encrypted? Keep in sync with .gitattributes.
is_managed() {
  case "$1" in
    environments/.secrets/*)             return 0 ;;
    environments/certs/*.pem)            return 0 ;;
    deploy/mcp/claude-code-secrets.yaml) return 0 ;;
    *)                                   return 1 ;;
  esac
}

# True iff the first 10 bytes on stdin equal the git-crypt magic header.
stdin_is_encrypted() {
  local hex
  hex="$(head -c 10 | od -An -v -tx1 | tr -d ' \n')"
  [ "$hex" = "$MAGIC_HEX" ]
}

# True iff <file> exists and begins with the magic header.
file_is_encrypted() {
  local f="$1"
  [ -f "$f" ] || return 1
  stdin_is_encrypted < "$f"
}

scan() {
  # $1 = git revspec prefix: ":" for index (staged), "HEAD:" for committed tree.
  local prefix="$1" listcmd="$2" fail=0 f
  while IFS= read -r f; do
    is_managed "$f" || continue
    if ! git show "${prefix}${f}" 2>/dev/null | stdin_is_encrypted; then
      echo "PLAINTEXT (unencrypted) managed secret: $f" >&2
      fail=1
    fi
  done < <(eval "$listcmd")
  return "$fail"
}

case "${1:-}" in
  is-encrypted)
    [ $# -eq 2 ] || { echo "is-encrypted needs a file path" >&2; exit 2; }
    file_is_encrypted "$2"
    ;;
  check-staged)
    scan ":" "git diff --cached --name-only --diff-filter=ACM"
    ;;
  check-tracked)
    scan "HEAD:" "git ls-files"
    ;;
  *)
    echo "usage: $0 {is-encrypted <file>|check-staged|check-tracked}" >&2
    exit 2
    ;;
esac
