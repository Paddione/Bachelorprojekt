#!/usr/bin/env bats
# tests/spec/fleet-operations.bats
# SSOT: docs/superpowers/specs/2026-06-21-secrets-deploy-automation-design.md

setup() {
  load 'test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
}

@test "fleet-* sealed secrets contain all non-legacy keys from their legacy counterparts" {
  if ! command -v yq >/dev/null 2>&1; then
    skip "yq is not installed"
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    skip "python3 is not installed"
  fi

  # Collect legacy_only keys from environments/schema.yaml
  legacy_only_keys=$(python3 -c "
import yaml
with open('${REPO_ROOT}/environments/schema.yaml') as f:
    schema = yaml.safe_load(f)
for s in schema.get('secrets', []):
    if s.get('legacy_only', False):
        print(s['name'])
" 2>/dev/null || true)

  for pair in "mentolder:fleet-mentolder" "korczewski:fleet-korczewski"; do
    legacy="${pair%%:*}"
    fleet="${pair##*:}"

    legacy_file="${REPO_ROOT}/environments/sealed-secrets/${legacy}.yaml"
    fleet_file="${REPO_ROOT}/environments/sealed-secrets/${fleet}.yaml"

    if [[ ! -f "$legacy_file" || ! -f "$fleet_file" ]]; then
      continue
    fi

    legacy_keys=$(yq '.spec.encryptedData | keys | .[]' "$legacy_file" 2>/dev/null | sort)
    fleet_keys=$(yq '.spec.encryptedData | keys | .[]' "$fleet_file" 2>/dev/null | sort)

    missing=""
    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      # Skip if it is declared as legacy_only
      if echo "$legacy_only_keys" | grep -qxF "$key"; then
        continue
      fi
      # Skip if it is present in the fleet keys
      if echo "$fleet_keys" | grep -qxF "$key"; then
        continue
      fi
      missing="${missing} ${key}"
    done <<< "$legacy_keys"

    if [[ -n "$missing" ]]; then
      echo "Keys missing in sealed-secrets/${fleet}.yaml:${missing}" >&2
      false
    fi
  done
}
