#!/usr/bin/env bats
# tests/spec/workspace-deploy.bats
# SSOT: openspec/specs/workspace-deploy.md
# Covers T001396: Pocket-ID SMTP wiring (SMTP_USER unsubstituted in prod,
# missing POCKET_ID_SMTP_TLS derivation).
# Covers T001400: Pocket-ID SMTP_PORT unsubstituted in prod (ENVSUBST_VARS
# missed $SMTP_PORT in the same two prod deploy paths).
# Uses simple [ ... ] assertions (matches tests/spec/* convention).

load 'test_helper'

TASKFILE="${PROJECT_DIR}/Taskfile.yml"
POCKET_ID_MANIFEST="${PROJECT_DIR}/k3d/pocket-id.yaml"

# Extracts the workspace:deploy task body (from its header to the next
# top-level task header) so assertions only look at ENVSUBST_VARS lines
# belonging to this task, not e.g. the dev-branch literal envsubst call
# (which already lists $SMTP_USER correctly) or unrelated tasks.
_workspace_deploy_block() {
  sed -n '/^  workspace:deploy:$/,/^  workspace:partial-deploy:$/p' "$TASKFILE"
}

_workspace_partial_deploy_block() {
  sed -n '/^  workspace:partial-deploy:$/,/^  workspace:fix-tickets-grants:$/p' "$TASKFILE"
}

@test "workspace:deploy prod ENVSUBST_VARS includes \$SMTP_USER" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}

@test "workspace:deploy prod ENVSUBST_VARS includes \$POCKET_ID_SMTP_TLS" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$POCKET_ID_SMTP_TLS'"
  [ "$status" -eq 0 ]
}

@test "workspace:deploy prod ENVSUBST_VARS includes \$SMTP_PORT" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_PORT'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$SMTP_USER" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$SMTP_PORT" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_PORT'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$POCKET_ID_SMTP_TLS" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$POCKET_ID_SMTP_TLS'"
  [ "$status" -eq 0 ]
}

@test "k3d/pocket-id.yaml wires an SMTP_TLS container env" {
  run grep -c 'name: SMTP_TLS' "$POCKET_ID_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "workspace:deploy dev branch envsubsts \$STUDIO_IMAGE (T001799)" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | sed -n '/kustomize build k3d\//,/kubectl apply/p' | grep -F '\$STUDIO_IMAGE'"
  [ "$status" -eq 0 ]
}

@test "workspace:deploy dev branch still envsubsts \$SMTP_USER (no regression)" {
  # The dev-branch pipeline (kustomize build k3d/ | ... | envsubst ... | ... | kubectl apply)
  # may wrap across multiple piped lines (T001411 added a re-quoting sed stage
  # between kustomize build and envsubst), so match across the whole pipe
  # range rather than requiring both tokens on a single physical line.
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | sed -n '/kustomize build k3d\//,/kubectl apply/p' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}

# T001411: kustomize build re-serializes YAML and drops the quotes around a
# bare `"${VAR}"` placeholder (it isn't syntactically required for a plain
# scalar). When envsubst then substitutes a purely-numeric value like
# SMTP_PORT=587 into that now-unquoted placeholder, the result is a bare YAML
# integer (`value: 587`) instead of a string — which `kubectl apply
# --server-side` rejects for a corev1.EnvVar.Value field, aborting the whole
# apply chain for both brands. The fix inserts a sed stage between
# `kustomize build` and `envsubst` that re-quotes any `: ${VAR}` placeholder
# before substitution happens, so the quotes survive.
@test "workspace:deploy dev branch re-quotes kustomize-stripped \${VAR} placeholders before envsubst (T001411)" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | sed -n '/kustomize build k3d\//,/kubectl apply/p'"
  [ "$status" -eq 0 ]
  [[ "$output" == *'s/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g'* ]]
}

@test "workspace:deploy prod branch re-quotes kustomize-stripped \${VAR} placeholders before envsubst (T001411)" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | sed -n '/kustomize build \"\$overlay\/\"/,/kubectl --context/p'"
  [ "$status" -eq 0 ]
  [[ "$output" == *'s/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g'* ]]
}

@test "prod-fleet mentolder overlay renders pocket-id SMTP_PORT as a quoted string after the full deploy pipeline (T001411)" {
  export SMTP_PORT=587 SMTP_HOST=smtp.example.org SMTP_USER=x POCKET_ID_SMTP_TLS=starttls
  export POCKET_ID_FRONTEND_URL=https://auth.example POCKET_ID_URL=http://pocket-id:1411 POCKET_ID_DOMAIN=id.example
  run kustomize build "${PROJECT_DIR}/prod-fleet/mentolder" --load-restrictor=LoadRestrictionsNone
  [ "$status" -eq 0 ]
  requoted=$(printf '%s\n' "$output" | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g')
  rendered=$(printf '%s\n' "$requoted" | envsubst '$SMTP_PORT $SMTP_HOST $SMTP_USER $POCKET_ID_SMTP_TLS $POCKET_ID_FRONTEND_URL $POCKET_ID_URL $POCKET_ID_DOMAIN')
  smtp_port_block=$(printf '%s\n' "$rendered" | grep -A1 'name: SMTP_PORT')
  [[ "$smtp_port_block" == *'value: "587"'* ]]
}

# T001411 (hardening follow-up): the same latent bug class fixed above for
# workspace:deploy was still present in five other `kustomize build
# k3d/{coturn,office,rustdesk}-stack | envsubst` call sites (workspace:
# coturn-setup, workspace:office:deploy, and the three repeated inside
# fleet:shared-services) AND in workspace:partial-deploy (which uses
# `kustomize build "$overlay/"`, not a literal k3d/ path — an oversight in
# the original T001411 investigation, which had assumed workspace:
# partial-deploy was already covered by PR #2429; it wasn't). This
# structural scanner enumerates every `kustomize build ...` pipe chain in
# Taskfile.yml — literal k3d/ paths and dynamic ($overlay/, $WEBSITE_OVERLAY,
# ...) paths alike — and asserts each one that flows into an envsubst (via an
# unbroken run of `|`-continuation lines immediately following the
# `kustomize build` line) has the re-quoting sed stage first, so a future
# unhardened pipeline (of either shape) can't silently reintroduce the gap.
# Scoping "pending" to an unbroken pipe-continuation run (rather than "the
# next envsubst anywhere later in the file") is required to avoid false
# positives on build-only invocations that never pipe into envsubst at all —
# e.g. the placeholder-free `fleet:platform` build (piped straight to
# `kubectl apply`) or the `kustomize build ... >/dev/null && echo` dry-run
# sanity checks in `workspace:validate` — which would otherwise get
# spuriously blamed for an unrelated, much later envsubst call.
# T001652: website/src/db/migrations/*.sql had no automated runner, causing
# Prod-DB drift. website:migrate must exist and run before the website
# rollout in both workspace:deploy branches (dev + prod) and at the top of
# website:deploy, so every deploy path applies pending migrations first.

@test "website:migrate task exists in Taskfile.yml" {
  run grep -c '^  website:migrate:$' "$TASKFILE"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "task --dry-run website:migrate ENV=dev resolves without error" {
  run task -d "$PROJECT_DIR" -n website:migrate ENV=dev
  [ "$status" -eq 0 ]
}

@test "workspace:deploy dev branch runs website:migrate before the shared-db-dependent kustomize apply" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | sed -n '/if \[ \"{{.ENV}}\" = \"dev\" \]; then/,/kustomize build k3d\//p'"
  [ "$status" -eq 0 ]
  [[ "$output" == *'task website:migrate ENV='* ]]
}

@test "workspace:deploy prod branch runs website:migrate before the overlay apply" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | sed -n '/rollout status deployment\/shared-db -n \"\${_ws_ns}\"/,/overlay=\"\${ENV_OVERLAY/p'"
  [ "$status" -eq 0 ]
  [[ "$output" == *'task website:migrate ENV='* ]]
}

@test "website:deploy runs website:migrate before website:build" {
  run bash -c "_block() { sed -n '/^  website:deploy:\$/,/^cmds:\$/p' '$TASKFILE'; }; sed -n '/^  website:deploy:\$/,/^  [a-z]/p' '$TASKFILE' | grep -n 'task website:migrate\|task website:build'"
  [ "$status" -eq 0 ]
  migrate_line=$(echo "$output" | grep 'task website:migrate' | head -1 | cut -d: -f1)
  build_line=$(echo "$output" | grep 'task website:build' | head -1 | cut -d: -f1)
  [ -n "$migrate_line" ]
  [ -n "$build_line" ]
  [ "$migrate_line" -lt "$build_line" ]
}

@test "every kustomize build | envsubst pipeline in Taskfile.yml re-quotes stripped \${VAR} placeholders (T001411)" {
  run bash -c '
    awk '\''
      /kustomize build/ { pending=1; sed_seen=0; next }
      pending && /^[[:space:]]*\|/ {
        if (index($0, "s/: \\$\\{([a-zA-Z0-9_]+)\\}[[:space:]]*$/: \"${\\1}\"/g")) sed_seen=1
        if ($0 ~ /envsubst/) { if (!sed_seen) bad++; pending=0 }
        next
      }
      pending { pending=0 }
      END { print bad+0 }
    '\'' "'"$TASKFILE"'"
  '
  [ "$status" -eq 0 ]
  [ "$output" -eq 0 ]
}

# ── T001853: k3d-Basis-Drift — lokaler Dev-Cluster out-of-the-box deploybar ──
# Die k3d/-Basis muss auf jedem Single-Node-Cluster (k3d lokal, Remote-Dev)
# funktionieren: keine Prod-/Remote-Host-Affinities, keine Namespace-Literale,
# vollständige Dev-Secrets, dev-Netpol für den k3d-API-Server, Pocket-ID-
# Bootstrap und stabile k3d-API-Ports.

_website_deploy_block() {
  sed -n '/^  website:deploy:$/,/^  website:dev:$/p' "$TASKFILE"
}

@test "T001853: k3d base manifests carry no prod/remote host affinities (gekko-/pk-hetzner)" {
  run bash -c "grep -l 'gekko-hetzner\|pk-hetzner' \"$PROJECT_DIR\"/k3d/*.yaml"
  [ "$status" -ne 0 ]
}

@test "T001853: k3d base manifests use \${WEBSITE_NAMESPACE}, not website.website.svc literal" {
  run bash -c "grep -l 'website\.website\.svc' \"$PROJECT_DIR\"/k3d/*.yaml"
  [ "$status" -ne 0 ]
}

@test "T001853: k3d/secrets.yaml provides SESSIONS_CRON_TOKEN" {
  run grep -E '^[[:space:]]+SESSIONS_CRON_TOKEN:' "$PROJECT_DIR/k3d/secrets.yaml"
  [ "$status" -eq 0 ]
}

@test "T001853: k3d/secrets.yaml provides STUDIO_DB_URL" {
  run grep -E '^[[:space:]]+STUDIO_DB_URL:' "$PROJECT_DIR/k3d/secrets.yaml"
  [ "$status" -eq 0 ]
}

@test "T001853: website-dev-secrets.yaml covers all website-referenced keys" {
  local missing=0
  for key in INTERNAL_API_TOKEN ANTHROPIC_API_KEY BRETT_OIDC_SECRET DEEPSEEK_API_KEY DEEPSEEK_API_KEY_PK IPV64_API_KEY LLM_ROUTER_API_KEY SEPA_CREDITOR_BIC SEPA_CREDITOR_IBAN SEPA_CREDITOR_ID VOYAGE_API_KEY SESSIONS_CRON_TOKEN; do
    grep -qE "^[[:space:]]+${key}:" "$PROJECT_DIR/k3d/website-dev-secrets.yaml" || { echo "missing: $key"; missing=1; }
  done
  [ "$missing" -eq 0 ]
}

@test "T001853: website-dev-secrets.yaml namespace is envsubst-parameterized, not hardcoded" {
  run grep -E '^[[:space:]]+namespace: website$' "$PROJECT_DIR/k3d/website-dev-secrets.yaml"
  [ "$status" -ne 0 ]
  run grep -F 'namespace: ${WEBSITE_NAMESPACE}' "$PROJECT_DIR/k3d/website-dev-secrets.yaml"
  [ "$status" -eq 0 ]
}

@test "T001853: dev-only apiserver netpol exists in base and is stripped by prod overlay" {
  run grep -F 'network-policies-dev.yaml' "$PROJECT_DIR/k3d/kustomization.yaml"
  [ "$status" -eq 0 ]
  run grep -F 'allow-apiserver-egress-k3d' "$PROJECT_DIR/k3d/network-policies-dev.yaml"
  [ "$status" -eq 0 ]
  run grep -F 'allow-apiserver-egress-k3d' "$PROJECT_DIR/prod/kustomization.yaml"
  [ "$status" -eq 0 ]
}

@test "T001853: studio:build imports into the Taskfile cluster, not shell-fallback k3d-dev" {
  run grep -F ':-k3d-dev}' "$TASKFILE"
  [ "$status" -ne 0 ]
}

@test "T001853: studio-server base manifest uses imagePullPolicy IfNotPresent" {
  run grep -E 'imagePullPolicy:[[:space:]]*Always' "$PROJECT_DIR/k3d/studio.yaml"
  [ "$status" -ne 0 ]
  run grep -E 'imagePullPolicy:[[:space:]]*IfNotPresent' "$PROJECT_DIR/k3d/studio.yaml"
  [ "$status" -eq 0 ]
}

@test "T001853: k3d-config.yaml pins kubeAPI.hostPort against restart port drift" {
  run bash -c "sed -n '/^kubeAPI:/,/^[a-z]/p' \"$PROJECT_DIR/k3d-config.yaml\" | grep -E '^[[:space:]]+hostPort:'"
  [ "$status" -eq 0 ]
}

@test "T001853: pocket-id-db-init bootstraps seed-deploy api key idempotently" {
  run bash -c "grep -F 'INSERT INTO api_keys' \"$POCKET_ID_MANIFEST\""
  [ "$status" -eq 0 ]
  run bash -c "grep -F 'ON CONFLICT' \"$POCKET_ID_MANIFEST\""
  [ "$status" -eq 0 ]
}

@test "T001853: website:deploy dev branch targets current context (no ENV_CONTEXT kubectl)" {
  run bash -c '_wd() { sed -n "/^  website:deploy:\$/,/^  website:dev:\$/p" "'"$TASKFILE"'"; }; _wd | grep -E "!= \"dev\" \] && CTX_ARG="'
  [ "$status" -eq 0 ]
}

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

