#!/usr/bin/env bash
# fixtures/mkresult.sh — schreibt ein result.json im Report-Format.
# Aufruf: mkresult.sh <dir> <case> <variant> <role> <model> <rep> <split> <score>
#                      [outcome] [errors] [detours] [infra_reason]
# Ohne infra_reason: bewertetes Ergebnis; sonst Infra-Fehler ohne Score.
set -euo pipefail
dir="$1"; shift
r_case="$1"; r_variant="$2"; r_role="$3"; r_model="$4"; r_rep="$5"; r_split="$6"; r_score="$7"
r_outcome="${8:-}"; r_errors="${9:-0}"; r_detours="${10:-0}"; r_infra="${11:-}"
[ -z "$r_outcome" ] && r_outcome="$(node -e "console.log(Number(process.argv[1])/100)" "$r_score")"
mkdir -p "$dir"
if [ -n "$r_infra" ]; then
  cat > "$dir/result.json" <<EOF
{"case": "$r_case", "variant": "$r_variant", "perspective": "clean", "role": "$r_role", "model": "$r_model", "rep": $r_rep, "split": "$r_split", "source_ref": "T-fix", "stage": "execute", "score": null, "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "infra_error": "$r_infra", "reason": "$r_infra"}
EOF
else
  cat > "$dir/result.json" <<EOF
{"case": "$r_case", "variant": "$r_variant", "perspective": "clean", "role": "$r_role", "model": "$r_model", "rep": $r_rep, "split": "$r_split", "source_ref": "T-fix", "stage": "execute", "score": {"scoring_version": 1, "role": "$r_role", "outcome": $r_outcome, "errors": $r_errors, "detours": $r_detours, "effort": 0.5, "budget_penalty": 0, "score": $r_score, "events": []}, "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}
EOF
fi
