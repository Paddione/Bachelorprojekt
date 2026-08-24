# Proposal: wsl-exit-sdlc-console-fleet

## Why

Die sdlc-console (ghcr.io/paddione/website-sdlc, BUILD_TARGET=sdlc) läuft
heute im lokalen k3d und erreicht den LLM-Endpoint über den
`llm-proxy-host`-Hack: ein Service mit manuell gepflegtem Endpoints-Eintrag,
der die Bridge-IP des WSL-Hosts bindet. Mit dem WSL-Exit verschwindet der
Host — Console und ihr LLM-Zugang brauchen ein neues Zuhause im Fleet
(Namespace `workspace-dev`, neben dem restlichen Dev-Stack).

_Ticket: T016429_ · Parent-Epic: T016422 · depends: T016430 (Endpoints)

## What Changes

1. **Manifest-Umzug**: sdlc-console-Deployment von `k3d/sdlc-stack/` in den
   Fleet-Weg (`prod-fleet/dev`-Overlay bzw. `k3d/dev-stack/`, je nach
   bestehender Reconciliation-Kette von ks-dev.yaml).
2. **Hack-Ersatz**: `k3d/sdlc-stack/llm-proxy-host.yaml` (Service + manueller
   Endpoints-Eintrag auf Host-Bridge-IP) wird ersetzt durch die Fleet→
   Windows:1919-Route über wg/NAT (P0-Spike-Gate, Runbook in T016436).
3. **Fail-closed-Degradiert**: Ist FreeToken nicht erreichbar, startet die
   Console trotzdem — LLM-Endpunkte melden degradiert statt zu crashen.
4. **DB-Zugang** über shared-db (Endpoint aus T016430).

## Impact

- Affected specs: `sdlc-isolation`
- Affected code: `k3d/sdlc-stack/` (Rückbau), neue Dev-Stack-Manifeste,
  `tests/spec/`
- Die lokale k3d-SDLC-Stack-Laufzeit entfällt; `wsl --shutdown` wird damit
  für die Console ungefährlich.
