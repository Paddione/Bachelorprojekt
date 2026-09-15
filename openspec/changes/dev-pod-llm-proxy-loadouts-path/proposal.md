# Proposal: dev-pod-llm-proxy-loadouts-path

## Why

Der `llm-proxy` im `dev-pod` (Image `ghcr.io/paddione/mcp-node`) beantwortet Aufrufe von `/v1/embeddings`
mit HTTP 503 `bge_roles_unconfigured`:
`ENOENT: no such file or directory, open 'scripts/llm/loadouts.json'`.

Ursache: Im Container ist `WORKDIR /workspace` gesetzt, während das Git-Repository unter `/workspace/repo`
liegt (`DEV_POD_REPO`). Der Pfad `scripts/llm/loadouts.json` wurde in `scripts/llm-proxy/loadouts.mjs`
starr relativ zum aktuellen Arbeitsverzeichnis aufgelöst.
Folge: Embeddings (z. B. `openspec-embed`) scheitern im Cluster-Dev-Pod komplett.

## What

1. **Pfadauflösung in `loadouts.mjs` härten:**
   - Unterstützung der Umgebungsvariablen `LOADOUTS_PATH` (explizite Vorgabe).
   - Prüfen des relativen Pfads `scripts/llm/loadouts.json` im aktuellen `process.cwd()`.
   - Prüfen von `DEV_POD_REPO/scripts/llm/loadouts.json`.
   - Fallback über `import.meta.url` (Auflösung relativ zum Modul-Wurzelverzeichnis `../../scripts/llm/loadouts.json`).
   - Bereitstellung einer robusten `resolveDefaultLoadoutsPath()`-Funktion für `DEFAULT_PATH`, `readLoadouts()` und `writeLoadouts()`.

2. **Supervisor im `mcp-node`-Image konfigurieren:**
   - In `docker/mcp-node/supervisor.sh` wird dem `llm-proxy`-Prozess `LOADOUTS_PATH="${LOADOUTS_PATH:-$REPO/scripts/llm/loadouts.json}"` mitgegeben.

3. **Absicherung & Tests:**
   - Unit-Tests in `scripts/llm-proxy/loadouts.test.mjs` für verschiedene Pfadauflösungs-Szenarien.
   - BATS-Spec `tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats`.

_Ticket: T900109_
