#!/usr/bin/env bash
# Apply the docs-content ConfigMap to both prod clusters and restart docs pods.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CM_FILE=$(mktemp --suffix=.yaml)
CM_FILE_K=$(mktemp --suffix=.yaml)
trap 'rm -f "$CM_FILE" "$CM_FILE_K"' EXIT

echo "→ Building docs-content ConfigMap from kustomize..."
kubectl kustomize "$REPO_ROOT/k3d/" | python3 - <<'PYEOF' > "$CM_FILE"
import yaml, sys
for d in yaml.safe_load_all(sys.stdin.read()):
    if d and d.get('kind') == 'ConfigMap' and d.get('metadata', {}).get('name') == 'docs-content':
        print(yaml.dump(d, allow_unicode=True, default_flow_style=False))
        break
PYEOF

if [[ ! -s "$CM_FILE" ]]; then
  echo "ERROR: Could not extract docs-content ConfigMap from kustomize output" >&2
  exit 1
fi

# mentolder
echo "→ mentolder (namespace: workspace)..."
kubectl --context mentolder apply -f "$CM_FILE" -n workspace --server-side --force-conflicts
kubectl --context mentolder rollout restart deployment/docs -n workspace
kubectl --context mentolder rollout status deployment/docs -n workspace --timeout=120s

# korczewski-ha uses a different namespace
python3 -c "
import yaml
with open('$CM_FILE') as f:
    cm = yaml.safe_load(f)
cm['metadata']['namespace'] = 'workspace-korczewski'
with open('$CM_FILE_K', 'w') as f:
    yaml.dump(cm, f, allow_unicode=True, default_flow_style=False)
"

echo "→ korczewski-ha (namespace: workspace-korczewski)..."
kubectl --context korczewski-ha apply -f "$CM_FILE_K" -n workspace-korczewski --server-side --force-conflicts
kubectl --context korczewski-ha rollout restart deployment/docs -n workspace-korczewski
kubectl --context korczewski-ha rollout status deployment/docs -n workspace-korczewski --timeout=120s

echo
echo "✓ Docs ConfigMap updated on both clusters"
echo "  https://docs.mentolder.de"
echo "  https://docs.korczewski.de"
