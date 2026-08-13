---
title: "fix-env-resolve-website-digest — Implementation Plan"
ticket_id: T004041
domains: [infra, deployment]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-env-resolve-website-digest — Implementation Plan

_Ticket: T004041_

## Root Cause (verifiziert, T002448-M5)

`scripts/env-resolve.sh` exportiert alle env_vars unbedingt (`emit()` →
`export NAME=value`, ohne Pruefung, ob die Variable im Caller bereits gesetzt
ist). `scripts/flux-render-artifact.sh` sourced env-resolve.sh in jeder
Subshell — NACHDEM `render-fleet-artifact.yml` den echten Website-Digest als
Env gesetzt hat. Das Sourcing ueberschreibt den echten Wert mit dem in
`environments/fleet-*.yaml` hardcodierten Placeholder `sha256:1111…`;
`envsubst` baeckt ihn in `prod-fleet/website-*/website-patch.yaml` ein.

Reproducer (ausgefuehrt am 2026-08-13, Stand main):

```bash
WEBSITE_IMAGE_DIGEST="sha256:565e7cec…" \
  bash -c 'set +u; source scripts/env-resolve.sh fleet-mentolder 2>/dev/null; echo "$WEBSITE_IMAGE_DIGEST"'
# → sha256:1111111111111111111111111111111111111111111111111111111111111111
```

Der T002706-Guard prueft nur Digest-Form (`@sha256:`), nicht Placeholder-Form —
`sha256:1111…` ist formell gueltig, der Guard bleibt gruen.

## File Structure

- `scripts/env-resolve.sh` — `emit()` respektiert Caller-gesetzte Variablen
- `scripts/flux-render-artifact.sh` — Digest-`:=`-Defaults entfernen + Placeholder-Guard
- `tests/unit/env-resolve.bats` — 2 neue Caller-Respect-Tests (RED, im Stage-Commit)
- `tests/spec/flux-render-security/immutable-image-refs.bats` — Fixture-Digests + Regression + Guard-Test (RED, im Stage-Commit)
- `tests/spec/flux-artifact-versioning/flux-artifact-versioning.bats` — Fixture-Digests statt Placeholder-Werten
- `tests/spec/workspace-deploy.bats` — Fixture-Digests fuer die zwei Offline-Render-Tests

## Verify (RED → GREEN)

- [ ] **Task 1: Failing-Test-Step (RED).** Die vier neuen Tests sind im
      Stage-Commit enthalten und laufen auf dem ungefixten Branch rot:
      - `tests/unit/lib/bats-core/bin/bats tests/unit/env-resolve.bats` →
        Tests "T004041: caller-set env vars are not clobbered" und "caller-set
        setup_vars are not clobbered" schlagen fehl (env-resolve ueberschreibt
        den Caller-Wert).
      - `tests/unit/lib/bats-core/bin/bats tests/spec/flux-render-security/immutable-image-refs.bats` →
        Tests "T004041: caller-provided website digest survives" (Placeholder
        statt Caller-Digest) und "T004041: renderer aborts when a placeholder
        digest would reach the artifact" (Render endet mit 0, Guard fehlt)
        schlagen fehl.
      expected: FAIL (red — the fix is not yet implemented)

- [ ] **Task 2: env-resolve.sh respektiert Caller-Werte (Wurzel-Fix).**
  - Datei: `scripts/env-resolve.sh`
  - Im Python-Block: `emit()` ueberspringt Namen, die bereits in `os.environ`
    stehen (`if name in os.environ: return`), bevor das `export`-Statement
    gedruckt wird. Gilt uniform fuer convenience vars (`ENV_CONTEXT`/
    `ENV_DOMAIN`/`ENV_OVERLAY`), env_vars und setup_vars.
  - Kein weiterer Aufrufer aendert sich: alle bestehenden Tests laufen in
    frischen Shells ohne vorgesetzte Variablen.

- [ ] **Task 3: flux-render-artifact.sh — Digest-Defaults entfernen + Guard.**
  - Datei: `scripts/flux-render-artifact.sh`
  - `: "${WEBSITE_IMAGE_DIGEST:=}"` und `: "${BRETT_IMAGE_DIGEST:=}"` entfernen;
    `: "${WEBSITE_IMAGE_TAG:=latest}"` bleibt (echter Default, kein Placeholder).
    Die Export-Zeile auf `export WEBSITE_IMAGE_TAG` reduzieren (envsubst
    bekommt die Digests ohnehin aus env-resolve in den Subshells).
    Begruendung: Das leere `:=`-Export wuerde nach dem Caller-Respect-Fix als
    „Caller-Wert" gelten und den env-file-Placeholder in Offline-Rendern
    unterdruecken (image endet auf `@`).
  - In der Validation-Gate-Sektion (nach den 8 Render-Bloecken): Scan ueber
    `$OUT_DIR` auf die beiden Placeholder-Digests
    (`sha256:1111111111111111111111111111111111111111111111111111111111111111`,
    `sha256:2222222222222222222222222222222222222222222222222222222222222222`).
    Treffer → Exit 1 mit Fundstellen und Hinweis, dass CI die Digests via
    `scripts/resolve-image-digest.sh` setzt. Always-on, analog
    checksum/config-Check (T002156) — ein Offline-Render ohne Digest bricht
    damit bewusst mit klarer Meldung ab (fail-closed).

- [ ] **Task 4: Bestands-Render-Tests auf Fixture-Digests umstellen.**
  - Datei: `tests/spec/flux-artifact-versioning/flux-artifact-versioning.bats`
    — die beiden Tests exportieren statt `sha256:1111…`/`sha256:2222…` echte
    Fixture-Digests (z.B. `sha256:565e7cec…` Website,
    `sha256:9090…` Brett), sonst bricht der Guard den Render ab.
  - Datei: `tests/spec/workspace-deploy.bats` — in den beiden
    Offline-Render-Tests (T002236 validation gate, T002083 placeholder-free
    tree) dieselben Fixture-Digests exportieren.

- [ ] **Task 5: GREEN-Verifikation.**
  - `tests/unit/lib/bats-core/bin/bats tests/unit/env-resolve.bats` → 12/12 ok
  - `tests/unit/lib/bats-core/bin/bats tests/spec/flux-render-security/immutable-image-refs.bats` → 6/6 ok
  - `tests/unit/lib/bats-core/bin/bats tests/spec/flux-artifact-versioning/` → ok
  - `tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats` → ok
  - Ticket-Reproducer: `WEBSITE_IMAGE_DIGEST="sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41" bash -c 'set +u; source scripts/env-resolve.sh fleet-mentolder 2>/dev/null; echo "$WEBSITE_IMAGE_DIGEST"'` → Wert bleibt unveraendert.
  - CI-Pfad-Simulation: `WEBSITE_IMAGE_DIGEST=… BRETT_IMAGE_DIGEST=… bash scripts/flux-render-artifact.sh --out /tmp/…` → Website-Deployment traegt den Caller-Digest, kein `sha256:1111…` im Baum.

- [ ] **Task 6: Final Verification (CI-Gates).**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Post-Merge Deploy-Verifikation (DoD, T004041)

Nach dem Merge pruefen, dass Flux das neue Artefakt reconcilingt und das
Website-Deployment beider Brands auf ein neues Image rollt (kein
ImagePullBackOff mehr):

```bash
kubectl --context fleet get deploy website -n website -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl --context fleet get deploy website -n website-korczewski -o jsonpath='{.spec.template.spec.containers[0].image}'
# Erwartet: ghcr.io/paddione/website@sha256:<echter Digest>, nicht sha256:1111…
```
