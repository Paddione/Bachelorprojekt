#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# env-resolve.sh — Resolve and export all variables for an environment
# ═══════════════════════════════════════════════════════════════════
# Reads an environment file + schema defaults and exports all variables
# as shell environment variables, using python3/PyYAML so multi-line
# strings, quoted scalars, and block scalars all resolve correctly.
# (The previous grep/awk implementation silently truncated values that
# spanned multiple lines — notably STRIPE_PUBLISHABLE_KEY using YAML
# line-continuation — to the first line.)
#
# Usage:
#   source scripts/env-resolve.sh <env-name> [env-dir]
#
# Exports:
#   - ENV_CONTEXT — kubectl context from environment file
#   - ENV_DOMAIN  — domain from environment file
#   - ENV_OVERLAY — overlay from environment file (empty if not set)
#   - All schema env_vars, with default_dev fallback for dev envs
#   - All schema setup_vars (no dev fallback)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Arguments ────────────────────────────────────────────────────

_ENV_NAME="${1:-}"
_ENV_DIR="${2:-environments}"

if [[ -z "$_ENV_NAME" ]]; then
  echo "ERROR: Usage: source scripts/env-resolve.sh <env-name> [env-dir]" >&2
  return 1 2>/dev/null || exit 1
fi

_SCHEMA="${_ENV_DIR}/schema.yaml"
_ENV_FILE="${_ENV_DIR}/${_ENV_NAME}.yaml"

if [[ ! -f "$_SCHEMA" ]]; then
  echo "ERROR: Schema file not found: ${_SCHEMA}" >&2
  return 1 2>/dev/null || exit 1
fi

if [[ ! -f "$_ENV_FILE" ]]; then
  echo "ERROR: Environment file not found: ${_ENV_FILE}" >&2
  return 1 2>/dev/null || exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found (required for YAML parsing)" >&2
  return 1 2>/dev/null || exit 1
fi

# ── Build export block via python3/PyYAML ────────────────────────

_exports=$(SCHEMA="$_SCHEMA" ENV_FILE="$_ENV_FILE" python3 <<'PY'
import os, shlex, sys
try:
    import yaml
except ImportError:
    sys.stderr.write("ERROR: PyYAML not installed (pip install pyyaml)\n")
    sys.exit(1)

with open(os.environ["SCHEMA"]) as f:
    schema = yaml.safe_load(f) or {}
with open(os.environ["ENV_FILE"]) as f:
    env_file = yaml.safe_load(f) or {}

is_dev = env_file.get("environment") == "dev"


def emit(name, value):
    # Always export convenience vars (empty ok); skip env/setup vars
    # with no value to match the original shell-script behaviour.
    print(f"export {name}={shlex.quote(str(value))}")


# Convenience vars — exported even when empty so callers can reference
# them under `set -u` without tripping.
for src_key, export_name in (
    ("context", "ENV_CONTEXT"),
    ("domain", "ENV_DOMAIN"),
    ("overlay", "ENV_OVERLAY"),
):
    v = env_file.get(src_key)
    emit(export_name, v if v is not None else "")

env_vars = env_file.get("env_vars") or {}
for entry in schema.get("env_vars") or []:
    name = entry["name"]
    v = env_vars.get(name)
    if (v is None or v == "") and is_dev:
        v = entry.get("default_dev")
    if v is not None and v != "":
        emit(name, v)

setup_vars = env_file.get("setup_vars") or {}
for entry in schema.get("setup_vars") or []:
    name = entry["name"]
    v = setup_vars.get(name)
    if v is not None and v != "":
        emit(name, v)
PY
)

eval "$_exports"

# ── Cleanup internal vars ───────────────────────────────────────

unset _ENV_NAME _ENV_DIR _SCHEMA _ENV_FILE _exports
