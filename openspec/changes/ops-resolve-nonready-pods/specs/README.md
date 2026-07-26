# Spec: OPS01 Resolve

## Acceptance Criteria

1. `kubectl get pods -A | grep -v Running | grep -v Completed | grep -v Closed` zeigt keine CrashLoopBackOff/ContainerCreating/CreateContainerConfigError-Pods
2. Brett-oauth2-proxy läuft stabil in beiden Namespaces
3. LiveKit-Egress läuft (ContainerCreating resolved)
4. terminal-oauth2-proxy läuft in korczewski

## Nicht-Scope

- Keine Neukonfiguration der oauth2-proxy-Deployments (nur operative Fixes)
- Kein Node-Maintenance (es sei denn, der Node ist die Ursache)
