#!/usr/bin/env bash
set -euo pipefail
for f in k3d/secrets.yaml k3d/backup-secrets.yaml; do
  if [ ! -f "$f" ]; then
    name="$(basename "$f" .yaml)"
    printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\ntype: Opaque\nstringData:\n  PLACEHOLDER: ci-dummy\n' "$name" > "$f"
  fi
done
