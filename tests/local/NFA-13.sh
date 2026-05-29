#!/usr/bin/env bash
# NFA-13: Brett SFX assets are sourced canonically (regression guard for T000293).
#
# scripts/assets-sync.sh mirrors assets/audio/ -> brett/public/assets/sfx/ with
# `rsync --delete`, so any .ogg referenced by brett code but absent from the
# canonical assets/audio/ gets stripped at every `task feature:brett` build and
# 404s in prod. This test fails if any referenced SFX is missing from the source.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
AUDIO_SRC="${REPO_ROOT}/assets/audio"
BRETT_JS="${REPO_ROOT}/brett/public/assets"

# T1: every .ogg referenced in brett JS exists in the canonical source
referenced="$(grep -rhoE "[a-z0-9_-]+\.ogg" "$BRETT_JS" --include='*.js' --include='*.mjs' 2>/dev/null | sort -u)"
missing=""
for f in $referenced; do
  [[ -f "${AUDIO_SRC}/${f}" ]] || missing+="${f} "
done
missing="${missing% }"
assert_eq "$missing" "" "NFA-13" "T1" "All brett-referenced SFX exist in canonical assets/audio/"

# T2: assets:sync is idempotent for SFX — no file in the served sfx/ dir is absent
# from the source (i.e. a build would not delete anything brett ships today).
SFX_DIR="${BRETT_JS}/sfx"
orphans=""
if [[ -d "$SFX_DIR" ]]; then
  while IFS= read -r f; do
    base="$(basename "$f")"
    [[ -e "${AUDIO_SRC}/${base}" ]] || orphans+="${base} "
  done < <(find "$SFX_DIR" -maxdepth 1 -name '*.ogg' -print)
fi
orphans="${orphans% }"
assert_eq "$orphans" "" "NFA-13" "T2" "No served SFX would be stripped by assets:sync (sfx/ subset of source)"

assert_summary
