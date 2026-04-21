#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# secrets-sync.bats — Validate three-way secret consistency
# ═══════════════════════════════════════════════════════════════════
# Ensures environments/schema.yaml, k3d/secrets.yaml (workspace-secrets),
# and every environments/sealed-secrets/*.yaml are always in sync.
#
# Rules:
#   1. Every schema secret → must exist in k3d/secrets.yaml
#   2. Every k3d/secrets.yaml key → must exist in schema (no orphans)
#   3. Every schema secret → must exist in each SealedSecret
#
# Prerequisites: python3, pyyaml
# No cluster required — pure static analysis.
# ═══════════════════════════════════════════════════════════════════

load test_helper

SCHEMA="${PROJECT_DIR}/environments/schema.yaml"
DEV_SECRETS="${PROJECT_DIR}/k3d/secrets.yaml"
SEALED_DIR="${PROJECT_DIR}/environments/sealed-secrets"

# ── Helpers ──────────────────────────────────────────────────────

schema_keys() {
  python3 - "$SCHEMA" <<'EOF'
import sys, yaml
with open(sys.argv[1]) as f:
    schema = yaml.safe_load(f)
for s in schema.get('secrets', []):
    print(s['name'])
EOF
}

dev_workspace_keys() {
  python3 - "$DEV_SECRETS" <<'EOF'
import sys, yaml
with open(sys.argv[1]) as f:
    docs = list(yaml.safe_load_all(f))
for doc in docs:
    if doc and doc.get('kind') == 'Secret' and doc.get('metadata', {}).get('name') == 'workspace-secrets':
        data = doc.get('stringData') or doc.get('data') or {}
        for k in sorted(data.keys()):
            print(k)
EOF
}

sealed_keys() {
  local file="$1"
  python3 - "$file" <<'EOF'
import sys, yaml
with open(sys.argv[1]) as f:
    doc = yaml.safe_load(f)
enc = doc.get('spec', {}).get('encryptedData', {})
for k in sorted(enc.keys()):
    print(k)
EOF
}

# ── Schema ↔ Dev Secrets ─────────────────────────────────────────

@test "every schema secret exists in k3d/secrets.yaml workspace-secrets" {
  local missing=()
  while IFS= read -r key; do
    if ! dev_workspace_keys | grep -qx "$key"; then
      missing+=("$key")
    fi
  done < <(schema_keys)

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Keys in schema but missing from k3d/secrets.yaml:"
    printf '  %s\n' "${missing[@]}"
    return 1
  fi
}

@test "every k3d/secrets.yaml workspace-secrets key exists in schema" {
  local orphans=()
  while IFS= read -r key; do
    if ! schema_keys | grep -qx "$key"; then
      orphans+=("$key")
    fi
  done < <(dev_workspace_keys)

  if [[ ${#orphans[@]} -gt 0 ]]; then
    echo "Keys in k3d/secrets.yaml but missing from schema (orphans):"
    printf '  %s\n' "${orphans[@]}"
    return 1
  fi
}

# ── Schema → SealedSecrets ────────────────────────────────────────

@test "every schema secret exists in environments/sealed-secrets/mentolder.yaml" {
  local file="${SEALED_DIR}/mentolder.yaml"
  local missing=()
  while IFS= read -r key; do
    if ! sealed_keys "$file" | grep -qx "$key"; then
      missing+=("$key")
    fi
  done < <(schema_keys)

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Keys in schema but missing from mentolder.yaml SealedSecret:"
    printf '  %s\n' "${missing[@]}"
    return 1
  fi
}

@test "every schema secret exists in environments/sealed-secrets/korczewski.yaml" {
  local file="${SEALED_DIR}/korczewski.yaml"
  local missing=()
  while IFS= read -r key; do
    if ! sealed_keys "$file" | grep -qx "$key"; then
      missing+=("$key")
    fi
  done < <(schema_keys)

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Keys in schema but missing from korczewski.yaml SealedSecret:"
    printf '  %s\n' "${missing[@]}"
    return 1
  fi
}
