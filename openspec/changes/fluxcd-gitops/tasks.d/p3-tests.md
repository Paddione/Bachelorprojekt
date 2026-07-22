---
title: "fluxcd-gitops (p3-tests) — Implementation Plan"
ticket_id: T002083
domains: [tests, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fluxcd-gitops — Implementation Plan (p3-tests)

_Ticket: T002083 · Partial: p3-tests (Rolle: tests, STRUCT2-Träger)_

Dieses Partial schreibt **nur Tests** (rot→grün) für den Pull-based-GitOps-Umbau.
Die Implementierung der geprüften Artefakte (`scripts/flux-render-artifact.sh`,
`flux/clusters/fleet/*`, neue/rückgebaute Workflows) kommt aus den Partials p1/p2.
Die hier hinzugefügten BATS-`@test`-Blöcke werden **zuerst** committet und
**scheitern** auf dem noch nicht implementierten Stand (`expected: FAIL`), bevor
p1/p2 sie grün ziehen.

## File Structure

Geänderte / neue Dateien (disjunkt zu p1/p2 — ausschließlich Test-/Inventar-Artefakte):

- `tests/spec/workspace-deploy.bats` — bestehende Datei erweitern: Render-Vertrag von
  `scripts/flux-render-artifact.sh` + Struktur-/Schema-Prüfungen der `flux/clusters/fleet/`-CRs
  (FluxInstance, Kustomization-Kette, `flux-sealed-secrets` `prune:false`). Ungated (`.bats`
  nicht in `s1.limits`) → kein Zeilenbudget.
- `tests/spec/ci-cd.bats` — bestehende Datei erweitern: CI-Rückbau (`deploy-sealed-secrets.yml`
  entfällt, `post-merge.yml` kein direktes `task workspace:deploy`, neuer
  `render-fleet-artifact.yml` mit `flux push artifact` + Receiver-Ping, `build-*.yml` ohne
  imperative `kubectl set image`/`rollout restart`). Ungated → kein Zeilenbudget.
- `website/src/data/test-inventory.json` — Regenerat via `task test:inventory` (generiertes
  Artefakt, nicht von Hand editieren). Ungated.

Referenz-Konventionen:
- `workspace-deploy.bats` nutzt `load 'test_helper'` + `${PROJECT_DIR}` (Repo-Wurzel).
- `ci-cd.bats` nutzt `setup()` mit `REPO_ROOT`/`WF`/`BUILD_WF`.
- BATS-Runner: `./tests/unit/lib/bats-core/bin/bats <datei>` (aus `task test:spec`).
- `flux` CLI ist v2.8.8 und hat **kein** `schema`/`validate`-Subkommando → Schema-Test
  bekommt einen Skip-Guard (läuft nur, wenn ein zukünftiges CLI es bereitstellt).
- Alle Assertions greppen auf semantisch stabile Marker (`kind: FluxInstance`,
  `flux push artifact`, `prune: false`) statt fragiler Ganzzeilen-Matches. Keine
  Brand-Domain-Literale in Fixtures (nur `example`/`example.org`).

---

### Task 1: RED — Render-Vertrag & Cluster-CR-Struktur in `tests/spec/workspace-deploy.bats`

Neuen Block ans Ende von `tests/spec/workspace-deploy.bats` anhängen. Zielpfade (aus
design.md / p1): `scripts/flux-render-artifact.sh` (rendert `sed|envsubst|sed` pro Komponente
nach einem Output-Verzeichnis) und `flux/clusters/fleet/` (statisch committete FluxInstance +
Kustomization-Kette + Receiver + `ghcr-auth`-SealedSecret).

```bash
# ── T002083: fluxcd-gitops — pull-based GitOps Render- & Manifest-Verträge ──
FLUX_RENDER="${PROJECT_DIR}/scripts/flux-render-artifact.sh"
FLUX_CLUSTER_DIR="${PROJECT_DIR}/flux/clusters/fleet"

@test "T002083: scripts/flux-render-artifact.sh exists and is executable" {
  [ -f "$FLUX_RENDER" ]
  [ -x "$FLUX_RENDER" ]
}

@test "T002083: flux-render-artifact.sh is shellcheck-clean" {
  if ! command -v shellcheck >/dev/null 2>&1; then
    skip "shellcheck not installed in this context"
  fi
  run shellcheck -S warning "$FLUX_RENDER"
  [ "$status" -eq 0 ]
}

@test "T002083: flux-render-artifact.sh renders a placeholder-free tree (no bare \${VAR})" {
  # Non-secret fixture env (same shape as the T001411 offline render test);
  # secret-backed values live in SealedSecrets and are never envsubst-substituted.
  local out
  out="$(mktemp -d)"
  export SMTP_PORT=587 SMTP_HOST=smtp.example.org SMTP_USER=x POCKET_ID_SMTP_TLS=starttls
  export POCKET_ID_FRONTEND_URL=https://auth.example POCKET_ID_URL=http://pocket-id:1411 POCKET_ID_DOMAIN=id.example
  # Contract (p1): `flux-render-artifact.sh --out <dir>` renders every component tree
  # offline (kustomize|sed|envsubst|sed) without cluster/secret access.
  run bash "$FLUX_RENDER" --out "$out"
  [ "$status" -eq 0 ]
  # No unsubstituted ${...} placeholder may survive in any rendered manifest.
  local leftover
  leftover="$(grep -rIl '\${' "$out" || true)"
  rm -rf "$out"
  [ -z "$leftover" ]
}

@test "T002083: flux/clusters/fleet manifests all parse as valid YAML" {
  run python3 - "$FLUX_CLUSTER_DIR" <<'PY'
import sys, pathlib, yaml
d = pathlib.Path(sys.argv[1])
files = list(d.rglob('*.yaml')) + list(d.rglob('*.yml'))
assert files, 'no manifests under flux/clusters/fleet'
errs = []
for f in files:
    try:
        list(yaml.safe_load_all(f.read_text()))
    except yaml.YAMLError as e:
        errs.append(f'{f.name}: {e}')
assert not errs, 'YAML parse errors: ' + '; '.join(errs)
PY
  [ "$status" -eq 0 ]
}

@test "T002083: FluxInstance is fluxcd.controlplane.io/v1, kind FluxInstance, name flux" {
  run bash -c "grep -rIl 'kind:[[:space:]]*FluxInstance' '$FLUX_CLUSTER_DIR'"
  [ "$status" -eq 0 ]
  local f="$output"
  grep -qE '^apiVersion:[[:space:]]*fluxcd\.controlplane\.io/v1' "$f"
  grep -qE '^[[:space:]]*name:[[:space:]]*flux[[:space:]]*$' "$f"
}

@test "T002083: FluxInstance syncs from an OCIRepository source" {
  run bash -c "grep -rIl 'kind:[[:space:]]*FluxInstance' '$FLUX_CLUSTER_DIR'"
  [ "$status" -eq 0 ]
  grep -qE 'kind:[[:space:]]*OCIRepository' "$output"
}

@test "T002083: cluster CRs form a Kustomization dependsOn chain (kustomize.toolkit.fluxcd.io)" {
  run python3 - "$FLUX_CLUSTER_DIR" <<'PY'
import sys, pathlib, yaml
d = pathlib.Path(sys.argv[1])
ks = []
for f in list(d.rglob('*.yaml')) + list(d.rglob('*.yml')):
    for doc in yaml.safe_load_all(f.read_text()):
        if not doc:
            continue
        if doc.get('kind') == 'Kustomization' and str(doc.get('apiVersion','')).startswith('kustomize.toolkit.fluxcd.io'):
            ks.append(doc)
names = {k.get('metadata', {}).get('name') for k in ks}
assert 'flux-sealed-secrets' in names, f'flux-sealed-secrets Kustomization missing (have {sorted(n for n in names if n)})'
assert 'flux-platform' in names, f'flux-platform Kustomization missing (have {sorted(n for n in names if n)})'
# At least one dependsOn edge must wire the chain together.
assert any(k.get('spec', {}).get('dependsOn') for k in ks), 'no Kustomization declares dependsOn'
PY
  [ "$status" -eq 0 ]
}

@test "T002083: flux-sealed-secrets Kustomization sets prune: false (secrets never auto-pruned)" {
  run python3 - "$FLUX_CLUSTER_DIR" <<'PY'
import sys, pathlib, yaml
d = pathlib.Path(sys.argv[1])
found = None
for f in list(d.rglob('*.yaml')) + list(d.rglob('*.yml')):
    for doc in yaml.safe_load_all(f.read_text()):
        if not doc:
            continue
        if doc.get('kind') == 'Kustomization' and doc.get('metadata', {}).get('name') == 'flux-sealed-secrets':
            found = doc
assert found is not None, 'flux-sealed-secrets Kustomization not found'
assert found.get('spec', {}).get('prune') is False, 'flux-sealed-secrets must set spec.prune: false'
PY
  [ "$status" -eq 0 ]
}

@test "T002083: flux/clusters/fleet CRs carry no unsubstituted \${VAR} placeholders" {
  # The cluster-side CRs are committed static (not envsubst-rendered) → must be literal.
  local leftover
  leftover="$(grep -rIl '\${' "$FLUX_CLUSTER_DIR" || true)"
  [ -z "$leftover" ]
}

@test "T002083: flux CLI schema-validates the cluster manifests (when the subcommand exists)" {
  if ! command -v flux >/dev/null 2>&1; then
    skip "flux CLI not installed in this context"
  fi
  # flux v2.8.8 has no `schema`/`validate` subcommand — skip until a CLI provides one.
  if flux schema --help >/dev/null 2>&1; then
    run flux schema validate --path "$FLUX_CLUSTER_DIR"
  elif flux validate --help >/dev/null 2>&1; then
    run flux validate --path "$FLUX_CLUSTER_DIR"
  else
    skip "installed flux CLI ($(flux version --client 2>/dev/null | head -1)) has no schema/validate subcommand"
  fi
  [ "$status" -eq 0 ]
}
```

**RED-Nachweis (Pflicht, STRUCT2):** vor der p1/p2-Implementierung ausführen —

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats
# expected: FAIL (rot — scripts/flux-render-artifact.sh und flux/clusters/fleet/ existieren noch nicht)
```

**Acceptance:**
- Der neue Block ist ans Ende der Datei angehängt, alle bestehenden `@test`s bleiben unverändert.
- Auf dem aktuellen Branch (ohne p1/p2) scheitern mindestens die Existenz-/Struktur-Tests → `expected: FAIL`.
- Der Schema-Test **skippt** in der aktuellen Umgebung (flux v2.8.8), scheitert also nicht.
- Assertions greppen auf `kind: FluxInstance` / `prune: false` / `dependsOn` (semantisch stabil), nicht auf Ganzzeilen.

---

### Task 2: RED — CI-Rückbau in `tests/spec/ci-cd.bats`

Neuen Block ans Ende von `tests/spec/ci-cd.bats` anhängen (nutzt das bestehende `setup()`
mit `REPO_ROOT`, `WF` = `post-merge.yml`, `BUILD_WF` = `build-website.yml`).

```bash
# ── T002083: fluxcd-gitops — push→pull CI-Rückbau (SSOT: openspec/specs/ci-cd.md) ──

@test "T002083: deploy-sealed-secrets.yml workflow no longer exists" {
  [ ! -f "$REPO_ROOT/.github/workflows/deploy-sealed-secrets.yml" ]
}

@test "T002083: post-merge.yml has no unguarded task workspace:deploy in deploy-manifests" {
  # After the rebuild the deploy-manifests job is removed or only keeps a
  # FLUX_ENABLED break-glass fallback. Any surviving unguarded step fails.
  run python3 - "$WF" <<'PY'
import sys, re, yaml
doc = yaml.safe_load(open(sys.argv[1])) or {}
job = (doc.get('jobs', {}) or {}).get('deploy-manifests', {}) or {}
offenders = []
for s in (job.get('steps', []) or []):
    run = s.get('run', '') or ''
    if re.search(r'task\s+workspace:deploy', run):
        guard = (s.get('if', '') or '') + run
        if 'FLUX_ENABLED' not in guard:
            offenders.append(s.get('name', run[:40]))
assert not offenders, f'unguarded workspace:deploy steps remain: {offenders}'
PY
  [ "$status" -eq 0 ]
}

@test "T002083: render-fleet-artifact.yml workflow exists" {
  [ -f "$REPO_ROOT/.github/workflows/render-fleet-artifact.yml" ]
}

@test "T002083: render-fleet-artifact.yml pushes an OCI artifact via flux push artifact" {
  run grep -E 'flux[[:space:]]+push[[:space:]]+artifact' \
    "$REPO_ROOT/.github/workflows/render-fleet-artifact.yml"
  [ "$status" -eq 0 ]
}

@test "T002083: render-fleet-artifact.yml pings the Flux Receiver webhook after push" {
  # Receiver ping: a POST to the flux-webhook hook path (host resolved from config,
  # never a brand-domain literal in the workflow).
  run grep -iE 'flux-webhook|/hook/|receiver' \
    "$REPO_ROOT/.github/workflows/render-fleet-artifact.yml"
  [ "$status" -eq 0 ]
}

@test "T002083: build-website.yml no longer runs kubectl set image" {
  run grep -nE 'kubectl[[:space:]]+set[[:space:]]+image' "$BUILD_WF"
  [ "$status" -ne 0 ]
}

@test "T002083: build-brett.yml no longer runs an imperative kubectl rollout restart" {
  local brett_wf="$REPO_ROOT/.github/workflows/build-brett.yml"
  [ -f "$brett_wf" ]
  run grep -nE 'kubectl[[:space:]]+rollout[[:space:]]+restart' "$brett_wf"
  [ "$status" -ne 0 ]
}
```

**RED-Nachweis:**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
# expected: FAIL (rot — render-fleet-artifact.yml fehlt, deploy-sealed-secrets.yml existiert noch,
# build-website.yml enthält noch `kubectl set image`)
```

**Acceptance:**
- Block ans Dateiende angehängt, bestehende `@test`s unberührt.
- Tests scheitern auf dem aktuellen Branch (push-based Ist-Stand) → `expected: FAIL`.
- Der `post-merge.yml`-Test ist tolerant: Job entfernt **oder** nur FLUX_ENABLED-Fallback → grün.
- Keine Brand-Domain-Literale in den Assertions.

---

### Task 3: Test-Inventar regenerieren & committen

Nach dem Anhängen der neuen `@test`s in Task 1 + 2 muss das generierte Test-Inventar
neu erzeugt und mitcommittet werden — sonst schlägt der CI-Inventar-Check fehl
(`task test:inventory` re-run vs. committed `website/src/data/test-inventory.json`).

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/workspace-deploy.bats tests/spec/ci-cd.bats
```

**Acceptance:**
- `website/src/data/test-inventory.json` enthält die neuen `T002083`-`@test`-IDs beider Dateien.
- Ein erneuter `task test:inventory`-Lauf erzeugt **keine** Diff mehr (idempotent).
- Datei ist im gleichen Commit wie die Test-Änderungen.

---

### Task 4: GREEN + finale Verifikation

Voraussetzung: p1/p2 sind implementiert (`scripts/flux-render-artifact.sh`,
`flux/clusters/fleet/*`, `render-fleet-artifact.yml`, Rückbau von
`deploy-sealed-secrets.yml`/`post-merge.yml`/`build-*.yml`).

**GREEN-Nachweis** — dieselben BATS-Läufe wie in Task 1/2 müssen jetzt durchlaufen:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats
# expected: PASS (grün — Artefakte existieren; flux-schema-Test skippt in v2.8.8)
```

**Finale Verifikation (Pflicht-Gates):**

```bash
task test:changed          # gezielte Tests der geänderten Domains (BATS-Selection + quality)
task freshness:regenerate  # generierte Artefakte aktualisieren (test-inventory, repo-index, …)
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4) + Baseline-Assertion
```

**Acceptance:**
- Beide erweiterten Spec-Dateien laufen grün (Schema-Test skippt sauber).
- `task freshness:check` ist grün (kein Baseline-Wachstum; `.bats`/`.json` ungated).
- `test-inventory.json` ist idempotent regeneriert und committet.

---

## Offene Risiken (p3-tests)

1. **Render-Fixture-Kopplung:** Der placeholder-freie Render-Test setzt voraus, dass p1
   `scripts/flux-render-artifact.sh --out <dir>` **offline** (ohne Cluster/Secrets, nur mit den
   nicht-geheimen Fixture-env-Vars) lauffähig macht. Bricht der no-secrets-Modus (env-resolve),
   scheitert der Test aus einem anderen Grund als beabsichtigt — Abstimmung mit p1 nötig.
2. **CR-Namenskonvention:** Die Struktur-Tests hängen an den Kustomization-Namen
   `flux-sealed-secrets` und `flux-platform`. Weichen p1/p2 von diesen Namen ab, müssen die
   Assertions (und design.md) synchron nachgezogen werden.
3. **`post-merge.yml`-Toleranz:** Der Guard akzeptiert sowohl „Job entfernt" als auch
   „FLUX_ENABLED-Fallback". Ist der finale Rückbau strenger (Job komplett weg), bleibt der Test
   trotzdem grün — bewusst tolerant, kein blockierendes Signal für die strengere Variante.
4. **flux-Schema-Validierung nur latent aktiv:** In v2.8.8 skippt der Schema-Test immer; echte
   Schema-Fehler in `flux/clusters/fleet/` fangen nur der YAML-Parse- und die Struktur-Tests ab
   (plus optional `flux-schema-catalog` MCP zur Autorenzeit).
