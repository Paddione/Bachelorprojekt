#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# tests/spec/workspace-deploy-secrets-scope.bats
# ═══════════════════════════════════════════════════════════════════
# Regression test for T001404: workspace:deploy applied the
# sealed-secrets/<ENV>.yaml file un-scoped, allowing a brand-deploy
# (e.g. korczewski) to overwrite shared-NS SealedSecret documents
# (e.g. rustdesk/rustdesk-secrets, coturn/coturn-secrets) belonging
# to the other brand (mentolder). The same risk applies to coturn,
# which is structurally shared (deployed once via fleet:shared-services).
#
# The fix is a 3-layer defence:
#   1. Schema (`environments/schema.yaml`): optional `owner_brand: [<brand>]`
#      on extra_namespaces entries.
#   2. env-seal (`scripts/lib/seal-extra-namespaces.sh`): skip pairs whose
#      `owner_brand` does not include the current ENV. Emit annotation
#      `secrets.bachelorprojekt/owner-brand` on kept documents.
#   3. Taskfile (`workspace:deploy` prod branch): yq-based defence-in-depth
#      filter that drops documents whose owner-brand annotation does not
#      match ENV.
#
# This BATS file guards layers 1 + 2 end-to-end via a kubeseal stub
# (analog to `tests/spec/env-seal-empty-value-keys.bats`).
#
# SSOT: openspec/changes/t001404-workspace-deploy-secrets-scope
# ═══════════════════════════════════════════════════════════════════

load 'test_helper'

REPO_ROOT="${PROJECT_DIR}"
SEAL_SCRIPT="${REPO_ROOT}/scripts/env-seal.sh"
SCHEMA_FILE="${REPO_ROOT}/environments/schema.yaml"

# ── Helpers ──────────────────────────────────────────────────────

# Stub kubeseal: take the input Secret manifest on stdin and embed it
# verbatim inside a SealedSecret envelope. This lets the test assert
# on the secret stringData content without needing real encryption.
make_kubeseal_stub() {
  local stub_dir="$1"
  cat > "${stub_dir}/kubeseal" <<'STUB'
#!/usr/bin/env bash
cat
cat <<'ENVELOPE'
---
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: stub-envelope
  namespace: stub
spec:
  encryptedData: {}
ENVELOPE
STUB
  chmod +x "${stub_dir}/kubeseal"
}

# Build an env-seal input set in $1 (work dir) for the given mode.
# Modes:
#   mode=schema-only       — only schema + env file, no secrets (test 1)
#   mode=korczewski-skip    — schema with owner_brand:[mentolder] + CRON_SECRET
#                             (no owner_brand, namespace website)
#   mode=mentolder-keep     — same schema, run as mentolder
setup_seal_inputs() {
  local dir="$1"
  local mode="$2"
  local env_name="$3"
  mkdir -p "$dir/.secrets" "$dir/certs" "$dir/sealed-secrets"

  cat > "$dir/${env_name}.yaml" <<YAML
environment: ${env_name}
context: test-cluster
domain: test.local
YAML

  case "$mode" in
    schema-only)
      cat > "$dir/schema.yaml" <<'YAML'
version: 1
secrets:
  - name: RUSTDESK_ID_ED25519
    required: true
    extra_namespaces:
      - namespace: rustdesk
        secret: rustdesk-secrets
        dest_key: id_ed25519
YAML
      ;;
    korczewski-skip|mentolder-keep)
      cat > "$dir/schema.yaml" <<'YAML'
version: 1
secrets:
  - name: RUSTDESK_ID_ED25519
    required: true
    extra_namespaces:
      - namespace: rustdesk
        secret: rustdesk-secrets
        dest_key: id_ed25519
        owner_brand: [mentolder]
  - name: CRON_SECRET
    required: true
    extra_namespaces:
      - namespace: website
        secret: website-secrets
YAML
      cat > "$dir/.secrets/${env_name}.yaml" <<'YAML'
RUSTDESK_ID_ED25519: "stub-rustdesk-key"
CRON_SECRET: "stub-cron-key"
YAML
      ;;
  esac

  : > "$dir/certs/${env_name}.pem"
}

# ── Test 1: Schema-Static-Check ──────────────────────────────────

@test "schema: shared-namespace entries carry owner_brand" {
  [ -f "$SCHEMA_FILE" ] || skip "environments/schema.yaml not found"

  python3 - "$SCHEMA_FILE" <<'PY'
import sys, yaml
with open(sys.argv[1]) as f:
    schema = yaml.safe_load(f) or {}
shared_ns = {"rustdesk", "coturn"}
violations = []
for entry in schema.get("secrets") or []:
    for mapping in entry.get("extra_namespaces") or []:
        if mapping.get("namespace") in shared_ns:
            ob = mapping.get("owner_brand") or []
            if not ob:
                violations.append(f"{entry['name']} → {mapping['namespace']}")
if violations:
    print("VIOLATIONS:")
    for v in violations:
        print(f"  - {v}")
    sys.exit(1)
PY
}

# ── Test 2: korczewski skip ──────────────────────────────────────

@test "env-seal: korczewski omits shared-namespace SealedSecret documents" {
  [ -f "$SEAL_SCRIPT" ] || skip "env-seal.sh not found at $SEAL_SCRIPT"

  local stub_dir="${BATS_TEST_TMPDIR}/kubeseal-stub"
  local work="${BATS_TEST_TMPDIR}/env-seal-korczewski"
  mkdir -p "$stub_dir"
  make_kubeseal_stub "$stub_dir"
  setup_seal_inputs "$work" "korczewski-skip" "korczewski"

  PATH="${stub_dir}:${PATH}" \
    run bash "$SEAL_SCRIPT" --env korczewski --env-dir "$work" --reuse-cert 2>&1 || true

  local output_file="${work}/sealed-secrets/korczewski.yaml"
  [[ -f "$output_file" ]] \
    || { echo "Output file $output_file not created."; \
         echo "run output: $output"; false; }

  local rustdesk_hits
  rustdesk_hits=$(grep -c 'namespace: rustdesk' "$output_file" || true)
  [[ "$rustdesk_hits" -eq 0 ]] \
    || { echo "BUG: korczewski seal wrote $rustdesk_hits rustdesk-namespace documents (expected 0)."; \
         echo "--- output file content ---"; cat "$output_file"; \
         false; }
}

# ── Test 3: mentolder keep + annotation ─────────────────────────

@test "env-seal: mentolder keeps shared-namespace SealedSecret with owner-brand annotation" {
  [ -f "$SEAL_SCRIPT" ] || skip "env-seal.sh not found at $SEAL_SCRIPT"

  local stub_dir="${BATS_TEST_TMPDIR}/kubeseal-stub"
  local work="${BATS_TEST_TMPDIR}/env-seal-mentolder"
  mkdir -p "$stub_dir"
  make_kubeseal_stub "$stub_dir"
  setup_seal_inputs "$work" "mentolder-keep" "mentolder"

  PATH="${stub_dir}:${PATH}" \
    run bash "$SEAL_SCRIPT" --env mentolder --env-dir "$work" --reuse-cert 2>&1 || true

  local output_file="${work}/sealed-secrets/mentolder.yaml"
  [[ -f "$output_file" ]] \
    || { echo "Output file $output_file not created."; \
         echo "run output: $output"; false; }

  local rustdesk_hits
  rustdesk_hits=$(grep -c 'namespace: rustdesk' "$output_file" || true)
  [[ "$rustdesk_hits" -ge 1 ]] \
    || { echo "BUG: mentolder seal did not include rustdesk-namespace document."; \
         echo "--- output file content ---"; cat "$output_file"; \
         false; }

  grep -q 'secrets.bachelorprojekt/owner-brand:.*mentolder' "$output_file" \
    || { echo "BUG: owner-brand annotation missing or does not match mentolder."; \
         echo "--- output file content ---"; cat "$output_file"; \
         false; }
}
