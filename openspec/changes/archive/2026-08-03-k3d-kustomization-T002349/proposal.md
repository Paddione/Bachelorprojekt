# Proposal: k3d-kustomization-T002349

## Why

`k3d/default/kustomization.yaml` setzt `includeSelectors: true`, wodurch `managed-by: kustomize` in `spec.selector.matchLabels` des Deployments geschrieben wird. Der Live-Selector enthält nur `app: claude-code-mcp-monolith`, und `spec.selector` ist bei Deployments immutabel → `kubectl apply -k k3d/default` schlägt fehl.

Der dokumentierte Apply-Weg im SSOT (mcp-gateway.md) ist damit nicht ausführbar.

## What

1. `includeSelectors: false` in `k3d/default/kustomization.yaml` setzen
2. Apply-Weg einmal verifizieren (`kubectl apply -k k3d/default --context fleet`)
3. Failing-Test: BATS-Test der sicherstellt, dass `kubectl apply --dry-run=client -k k3d/default` nicht an immutable selector scheitert

_Ticket: T002349_
