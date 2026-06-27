# Proposal: docker-build-speedup

## Why

Die CI-Build-Zeiten der Docker-Images sind unnötig hoch und das Website-Image ist mit ~1,2 GB
aufgebläht. Verifizierte Ursachen (Code + echte GHA-Run-Durations 2026-06-27):

- **`docker build --no-cache`** in beiden Website-Workflows schaltet jegliches Layer-Caching hart
  ab; kein `cache-from`/`cache-to` irgendwo. `setup-node`-`cache:'npm'` ist toter Ballast, weil
  `npm ci` im Docker-Build läuft, nie am Runner.
- **Die Website wird 2× als byte-identisches Image gebaut** (mentolder + korczewski, je ~4 min).
  Der `website/Dockerfile` hat keine `ARG`-Zeile → die `--build-arg`-Aufrufe sind No-Ops; die
  Brand-Differenzierung passiert zu 100 % zur Runtime (`process.env.*` in SSR-Routes, ConfigMap via
  envsubst im Deploy-Step).
- **Das Runtime-Image** trägt volles `node_modules` inkl. devDeps (`COPY --from=build … node_modules`,
  kein `--omit=dev`) plus Chromium/kubectl/`tests/` (nur vom In-Cluster-Testrunner gebraucht;
  Chromium wird in `website/src` nie gelauncht).
- **Transcriber (~8 min, langsamster Build)** baut `linux/amd64,linux/arm64` via QEMU, obwohl fleet
  amd64-only ist; collabora ebenso.
- **Kein BuildKit-Cache-Mount** (`--mount=type=cache`) in irgendeinem Dockerfile.

Ziel: Build-Zeit bei Cache-Hit von ~4–8 min → ~1–2 min (website/videovault/transcriber),
Website-Image ~1,2 GB → ~600 MB, Website-Build-Last halbiert.

## What

Ein priorisierter Change in drei je-mergebaren Phasen:

1. **Cross-cutting Layer-Caching** über alle CI-gebauten Images: `docker/build-push-action@v6` mit
   `type=gha`-Cache (`mode=max` nur schwere Images wegen 10-GB-Budget), BuildKit-Cache-Mounts auf den
   Dependency-Layern (`--mount=type=cache`), `--no-cache` raus, toten `setup-node`-npm-Cache bereinigen.
2. **Website abspecken + 2→1 konsolidieren**: `npm prune --omit=dev` im Build-Stage (Chromium/kubectl/
   tests bleiben — bewusste Entscheidung „kein Runtime/Test-Split"), Boot+Smoke-Guardrail; und ein
   geteiltes Image für beide Brands (korczewski-Workflow wird deploy-only), abgesichert durch einen
   `import.meta.env.*`-Grep-Guardrail.
3. **arm64 droppen** bei `build-transcriber` + `build-collabora` (`platforms: linux/amd64`),
   abgesichert durch ein `kubectl get nodes -o wide` Pre-flight.

Spec/Design: `docs/superpowers/specs/2026-06-27-docker-build-speedup-design.md`.

_Ticket: T001229_
