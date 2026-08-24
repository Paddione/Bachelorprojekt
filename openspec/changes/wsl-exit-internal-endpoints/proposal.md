# Proposal: wsl-exit-internal-endpoints

## Why

`llm-gateway-embed` (:8081), `llm-gateway-rerank` (:8081) und `shared-db`
(:5432) sind im Namespace `workspace` nur als ClusterIP erreichbar. Konsumenten
außerhalb des Clusters — künftig der Windows-Desktop und der fleet-native
factory-runner (Epic T016422) — kommen nur über `kubectl port-forward` an sie.
Mit dem WSL-Exit entfällt die lokale Laufzeit, die diese Umwege bisher
ermöglichte; MCPs und Agenten brauchen stabile interne Endpoints.

_Ticket: T016430_ · Parent-Epic: T016422 · blockt T016429 (sdlc-console) und
T016433 (factory-runner)

## What Changes

1. **Domain-Registry**: zentrale Hostnamen für bge-embed/bge-rerank in
   `k3d/configmap-domains.yaml` ergänzen (`BGE_EMBED_HOST`, `BGE_RERANK_HOST`;
   dev-Defaults `*.localhost`, Prod-Override im Fleet-Overlay). Keine
   hardcodierten Hostnamen in den neuen Manifesten.
2. **IngressRoutes** für embed/rerank → Services `llm-gateway-embed/-rerank`,
   TLS nach vorhandenem Wildcard-Muster, erreichbar aus dem wg-Mesh.
3. **DB-Route fail-closed**: `shared-db` ausschließlich über einen internen,
   wg-gebundenen TCP-Eintrag (Traefik TCP-IngressRoute oder LB auf
   wg-Interface). 5432 darf von außen NICHT erreichbar sein.
4. **BATS-Test**: neue Manifeste referenzieren die Domain-Keys (kein
   hardcoded Host), DB-Endpoint ist nicht auf öffentlichem Entrypoint.

## Impact

- Affected specs: `fleet-operations`
- Affected code: `k3d/configmap-domains.yaml`, neue IngressRoute-Manifeste
  (k3d/ + prod-fleet-Overlay), `tests/spec/`
- Konsumenten (MCPs, Factory-Runner) können danach ohne port-forward arbeiten;
  Voraussetzung für T016429/T016433.
