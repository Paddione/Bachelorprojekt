#!/usr/bin/env bash
# scripts/lib/secrets-env.sh — which secret file feeds an environment. T900789
# SOURCE, do not execute. Defines secrets_env_for.
#
# An env file may declare `secrets_env: <name>`; the environment then reads
# environments/.secrets/<name>.yaml and applies sealed-secrets/<name>.yaml.
# environments/mentolder.yaml and korczewski.yaml point at fleet-<brand>: their
# former own secret files were sealed with the fleet cert but had drifted, so a
# break-glass deploy with ENV=mentolder overwrote live secrets with stale values.
#
# secrets_env_for <env> [env_dir=environments]
#   Prints the declared secrets_env, or <env> itself when the field or the env
#   file is absent (dev, staging and fleet-* keep their own files).

secrets_env_for() {
  local env_name="$1" env_dir="${2:-environments}"
  local env_file="${env_dir}/${env_name}.yaml" declared=""
  if [[ -f "$env_file" ]]; then
    declared=$(python3 -c '
import sys, yaml
d = yaml.safe_load(open(sys.argv[1])) or {}
v = d.get("secrets_env") if isinstance(d, dict) else None
print(v or "", end="")
' "$env_file") || return 1
  fi
  printf '%s\n' "${declared:-$env_name}"
}
