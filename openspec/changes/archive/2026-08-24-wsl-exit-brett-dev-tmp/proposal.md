# Proposal: wsl-exit-brett-dev-tmp

## Why

Der `brett`-Pod im Dev-Stack (`ns workspace-dev`) steht seit dem Rollout des
neuen Dev-Images (uid 1000) im CrashLoopBackOff (x163 am 2026-08-24): das
Image versucht, `/tmp/tsx-1000` anzulegen und stirbt mit
`mkdir '/tmp/tsx-1000' ENOENT`, weil kein schreibbares `/tmp` gemountet ist.
Der fehlgeschlagene Pod blockiert die flux-dev-Reconciliation
(`ks-dev.yaml` reconciled `prod-fleet/dev` → `k3d/dev-stack`).

Die oauth2-proxy-Siblings im selben Stack lösen dasselbe Problem mit einem
tmp-emptyDir-Mount — `brett-dev.yaml` hat dieses Muster nicht übernommen.

_Ticket: T016424_ · Parent-Epic: T016422 (WSL-Exit)

## What Changes

- `k3d/dev-stack/brett-dev.yaml`: `emptyDir`-Volume für `/tmp` ergänzen
  (Muster: `k3d/dev-stack/oauth2-proxy-dev.yaml`). Falls das Image beim Start
  weitere Schreibpfade braucht (npm-Cache), werden diese im selben Zug als
  emptyDir bedient.
- BATS-Test, der das Volume-Muster für alle uid≠0-Deployments im dev-stack
  verifiziert (Regressionsschutz für künftige Stack-Erweiterungen).

## Impact

- Affected specs: `fleet-operations`
- Affected code: `k3d/dev-stack/brett-dev.yaml`, `tests/spec/`
- Nach dem Merge reconciled flux-dev den Stack neu; der brett-Pod muss auf
  `Running` gehen und bei 0 Restarts bleiben.
