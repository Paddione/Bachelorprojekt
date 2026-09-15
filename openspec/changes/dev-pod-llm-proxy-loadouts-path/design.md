# Design: dev-pod-llm-proxy-loadouts-path

## Problemstellung & Diagnose

Im `dev-pod` (`ghcr.io/paddione/mcp-node`) läuft der Supervisor (`docker/mcp-node/supervisor.sh`)
aus dem Arbeitsverzeichnis `/workspace`. Der Git-Checkout wird durch das `repo-sync`-Sidecar
nach `/workspace/repo` synchronisiert (`DEV_POD_REPO`).

Beim Start von `llm-proxy`:
```bash
supervise llm-proxy env \
  LLM_PROXY_HOST_BIND="${LLM_PROXY_HOST_BIND:-0.0.0.0}" \
  LLM_PROXY_PORT="${LLM_PROXY_PORT:-18235}" \
  node "$REPO/scripts/llm-proxy/server.mjs"
```
läuft `node` mit cwd `/workspace`.

In `scripts/llm-proxy/loadouts.mjs` war der Pfad definiert als:
```javascript
export const DEFAULT_PATH = 'scripts/llm/loadouts.json';
```
Aufrufe von `readLoadouts(DEFAULT_PATH)` in `server.mjs` versuchten `/workspace/scripts/llm/loadouts.json` zu öffnen, was zu folgendem Fehler führte:
```json
{"error":{"code":"bge_roles_unconfigured","message":"ENOENT: no such file or directory, open 'scripts/llm/loadouts.json'"}}
```

## Lösungsarchitektur (Defense in Depth)

1. **Konfigurierbarkeit via `LOADOUTS_PATH`:**
   Falls die Umgebungsvariable `LOADOUTS_PATH` gesetzt ist, hat dieser Pfad immer Vorrang.

2. **CWD-Prüfung (`scripts/llm/loadouts.json`):**
   Wenn aus dem Root des Repositories ausgeführt wird (z. B. auf Entwickler-Workstations oder in CI), greift weiterhin der Standardpfad.

3. **`DEV_POD_REPO`-Unterstützung:**
   Falls `process.env.DEV_POD_REPO` gesetzt ist und dort `scripts/llm/loadouts.json` existiert, wird dieser Pfad verwendet.

4. **Modul-relative Auflösung (`import.meta.url`):**
   `loadouts.mjs` liegt unter `<repo>/scripts/llm-proxy/loadouts.mjs`.
   Die Datei `<repo>/scripts/llm/loadouts.json` liegt exakt zwei Verzeichnisebenen höher unter `scripts/llm/loadouts.json`.
   Über `fileURLToPath(new URL('../../scripts/llm/loadouts.json', import.meta.url))` lässt sich die Datei deterministisch auffinden, egal aus welchem Verzeichnis Node gestartet wurde.

5. **Supervisor-Deklaration:**
   In `docker/mcp-node/supervisor.sh` wird `LOADOUTS_PATH="${LOADOUTS_PATH:-$REPO/scripts/llm/loadouts.json}"` explizit gesetzt.
