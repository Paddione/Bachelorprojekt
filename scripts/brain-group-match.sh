#!/usr/bin/env bash
# brain-group-match.sh — shared group/pattern matcher for the brain ingest
# pipeline. Parses the `groups:` section of a brain ingest manifest in either
# shape:
#   - map style (production manifest, scripts/brain/ingest-sources.yaml):
#     "name: glob(s)" or "name: |" followed by an indented multiline glob list
#   - list style (BATS test fixtures): "- group: name" blocks with a nested
#     "include:" glob list
#
# Sourced by scripts/brain-ingest.sh and scripts/brain-ingest-worklist.sh —
# do not duplicate this matching logic in either script; both must stay in
# sync on what "belongs to a group" means.
#
# Perf note: brain_group_for() runs once per candidate file (thousands of
# calls before group-filtering narrows things down), so it and its helpers
# avoid spawning subprocesses (no awk/sed/echo) — pure bash string ops and
# global output vars instead of command substitution.

# Extracts the `groups:` section once. Call this ONE time per manifest and
# reuse the result across all brain_group_for() calls — re-parsing the
# manifest per file turns an O(files) walk into O(files * manifest-size)
# worth of subprocess forks.
brain_group_section_for_manifest() {
  local manifest="$1" line in_section=0
  _BRAIN_GROUP_SECTION=""
  while IFS= read -r line; do
    if [[ "$in_section" -eq 0 ]]; then
      [[ "$line" == "groups:" ]] && in_section=1
      continue
    fi
    if [[ "$line" =~ ^[a-zA-Z] ]]; then
      break
    fi
    _BRAIN_GROUP_SECTION+="$line"$'\n'
  done < "$manifest"
}

# Sets _BRAIN_REGEX_OUT. No subshell/subprocess — pure parameter expansion.
_brain_glob_to_regex() {
  local pattern="$1"
  # "**/"  -> optional path prefix (globstar directory wildcard)
  # "**"   -> any characters incl. "/"
  # "*"    -> any characters excl. "/" (single path segment)
  pattern="${pattern//\*\*\//@@GLOBSTAR_SLASH@@}"
  pattern="${pattern//\*\*/.*}"
  pattern="${pattern//\*/[^\/]*}"
  pattern="${pattern//\?/.}"
  _BRAIN_REGEX_OUT="${pattern//@@GLOBSTAR_SLASH@@/(.*\/)?}"
}

# brain_group_for <relative-path> <groups-section-text>
# Sets _BRAIN_GROUP_OUT and returns 0 on match; returns 1 on no match.
# <groups-section-text> comes from brain_group_section_for_manifest(),
# called ONCE by the caller, not per file.
brain_group_for() {
  local rel="$1" groups_section="$2"
  local group_name="" pattern="" in_multiline=0 in_include=0 value
  # $- holds current shopt/set flags as a string — checking it is a pure
  # bash builtin op. `set -o | grep noglob | head -1` (the previous approach)
  # forks two external processes per call, which dominates runtime when this
  # function runs thousands of times during worklist generation.
  local restore_glob=0
  [[ "$-" != *f* ]] && restore_glob=1
  set -f  # disable glob expansion while matching literal patterns
  _BRAIN_GROUP_OUT=""

  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue

    # --- list style: "  - group: <name>" opens a new group block ---
    if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+group:[[:space:]]*(.+)$ ]]; then
      group_name="${BASH_REMATCH[1]}"
      in_multiline=0
      in_include=0
      continue
    fi
    if [[ "$line" =~ ^[[:space:]]*include:[[:space:]]*$ ]]; then
      in_include=1
      continue
    fi
    if [[ "$in_include" -eq 1 ]]; then
      if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+\"?([^\"]+)\"?[[:space:]]*$ ]]; then
        pattern="${BASH_REMATCH[1]}"
        _brain_glob_to_regex "$pattern"
        if [[ "$rel" =~ ^${_BRAIN_REGEX_OUT}$ ]]; then
          [[ "$restore_glob" -eq 1 ]] && set +f
          _BRAIN_GROUP_OUT="$group_name"
          return 0
        fi
        continue
      else
        in_include=0
      fi
    fi

    # --- map style: "  name: |" (multiline block) or "  name: value(s)" ---
    if [[ "$line" =~ ^[[:space:]]{2}([a-zA-Z_-]+):\|[[:space:]]*$ ]]; then
      group_name="${BASH_REMATCH[1]}"
      in_multiline=1
      continue
    fi
    if [[ "$line" =~ ^[[:space:]]{2}([a-zA-Z_-]+):[[:space:]]+(.+)$ ]]; then
      group_name="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      in_multiline=0
      if [[ "$value" == "|" ]]; then
        in_multiline=1
        continue
      fi
      for pattern in $value; do
        [[ -z "$pattern" ]] && continue
        _brain_glob_to_regex "$pattern"
        if [[ "$rel" =~ ^${_BRAIN_REGEX_OUT}$ ]]; then
          [[ "$restore_glob" -eq 1 ]] && set +f
          _BRAIN_GROUP_OUT="$group_name"
          return 0
        fi
      done
      group_name=""
      continue
    fi
    if [[ "$in_multiline" -eq 1 ]] && [[ "$line" =~ ^[[:space:]]{4}(.+)$ ]]; then
      pattern="${BASH_REMATCH[1]}"
      # trim leading/trailing whitespace (pure bash, no sed)
      pattern="${pattern#"${pattern%%[![:space:]]*}"}"
      pattern="${pattern%"${pattern##*[![:space:]]}"}"
      [[ -z "$pattern" ]] && continue
      _brain_glob_to_regex "$pattern"
      if [[ "$rel" =~ ^${_BRAIN_REGEX_OUT}$ ]]; then
        [[ "$restore_glob" -eq 1 ]] && set +f
        _BRAIN_GROUP_OUT="$group_name"
        return 0
      fi
    fi
  done <<< "$groups_section"

  [[ "$restore_glob" -eq 1 ]] && set +f
  return 1
}
