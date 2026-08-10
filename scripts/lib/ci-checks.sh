#!/usr/bin/env bash
# scripts/lib/ci-checks.sh — shared evaluation of a PR check list.
# SOURCE, do not execute. Defines ci_checks_verdict.
#
# T003109 — a jq predicate of the form `all(...)` is vacuously `true` over the
# EMPTY list; a CI wait loop that reads "no more pending checks" from it treats
# a never-checked state as verified. A verdict is only trustworthy when the
# list is NON-EMPTY AND every entry is green. SSOT:
# openspec/specs/ci-cd.md (Requirement "Jedes Prädikat über einer Check-Liste
# braucht einen Nichtleere-Guard").
#
# ci_checks_verdict reads a JSON array in the gh schema `[{name,state}]` from
# stdin, prints EXACTLY ONE verdict word (empty|red|pending|green) and exits 0
# only for `green`:
#
#   Input                                       | Verdict | Exit
#   [] / empty string / no valid JSON array     | empty   | != 0
#   at least one FAILURE/ERROR/CANCELLED        | red     | != 0
#   non-empty, no red, >=1 non-SUCCESS          | pending | != 0
#   non-empty, all SUCCESS                      | green   |   0
#
# The ORDER is load-bearing: the non-empty condition is checked FIRST, as a
# standalone `jq 'length == 0'` step — NOT as a branch inside an all(...)
# expression. The separation is exactly what this ticket is about.
#
# The function must NOT call gh itself (testability without network) and must
# not swallow stderr into /dev/null: a jq parse error on malformed input stays
# visible on stderr, it is not hidden.

ci_checks_verdict() {
  local input
  input="$(cat)"

  # 1. Non-empty FIRST, as a standalone step. Empty string / no valid JSON
  #    array / [] is its own verdict (`empty`): neither success nor red.
  #    stdout of jq is discarded (only the exit code matters); stderr stays
  #    visible, so a parse error on malformed input is not hidden.
  if [[ -z "$input" ]] || ! printf '%s' "$input" | jq -e 'type == "array"' >/dev/null; then
    echo "empty"
    return 1
  fi
  if printf '%s' "$input" | jq -e 'length == 0' >/dev/null; then
    echo "empty"
    return 1
  fi

  # 2. Red: any FAILURE/ERROR/CANCELLED.
  if printf '%s' "$input" | jq -e 'any(.[]; .state == "FAILURE" or .state == "ERROR" or .state == "CANCELLED")' >/dev/null; then
    echo "red"
    return 1
  fi

  # 3. Pending: non-empty, no red, at least one non-SUCCESS.
  if printf '%s' "$input" | jq -e 'any(.[]; .state != "SUCCESS")' >/dev/null; then
    echo "pending"
    return 1
  fi

  # 4. Green: non-empty, all SUCCESS.
  echo "green"
  return 0
}
