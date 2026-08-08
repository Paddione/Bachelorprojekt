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

# Liefert nicht auskommentierte Treffer auf Prod-Host-Affinitaeten in <dir>/*.yaml.
# Kommentarzeilen sind ausgenommen: sie dokumentieren, sie konfigurieren nicht.
# Exit 0 = Verstoss gefunden, Exit 1 = sauber (Status der letzten Pipeline-Stufe).
_affinity_violations() {
  grep -rnE 'gekko-hetzner|pk-hetzner' "$1"/*.yaml 2>/dev/null \
    | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#'
}

@test "T001853: k3d base manifests carry no prod/remote host affinities (gekko-/pk-hetzner)" {
  # Positiv-Anker VOR der Negativ-Aussage (T002356-M1): ein echter, nicht
  # auskommentierter Eintrag MUSS gefunden werden — und eine reine Kommentarzeile
  # darf NICHT anschlagen. Ohne diesen Anker bestuende die Aussage unten vakuos,
  # sobald das Matching kaputt geht.
  local probe; probe="$(mktemp -d)"
  printf 'spec:\n  nodeName: pk-hetzner-8\n'                        > "$probe/real.yaml"
  printf '# Vorfall-Notiz zu pk-hetzner-8\nspec:\n  nodeName: k3d\n' > "$probe/commented.yaml"

  run _affinity_violations "$probe"
  local hits="$output"
  rm -rf "$probe"
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$hits" | grep -c 'real.yaml')" -eq 1 ]
  [ "$(printf '%s\n' "$hits" | grep -c 'commented.yaml')" -eq 0 ]

  # Eigentliche Aussage: keine echten Affinitaeten in den Basis-Manifesten.
  run _affinity_violations "$PROJECT_DIR/k3d"
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

@test "T002236: flux-render-artifact.sh validation gate accepts YAML 1.1 value-key scalars" {
  # Regression guard. The gate added in T002207 used a bare yaml.safe_load_all,
  # which has no constructor for tag:yaml.org,2002:value — the unquoted `=` in the
  # vendored kube-prometheus-stack AlertManager matchType enum. Because the gate is
  # fail-closed, every main push from 2026-07-26 18:19 aborted the artifact push for
  # both brands and silently froze prod at the last good artifact.
  #
  # This is asserted separately from the placeholder test below on purpose: that test
  # also checks [ "$status" -eq 0 ], so a render abort surfaced there under a name
  # about placeholders, which sent the first investigation down the wrong path.
  local out
  out="$(mktemp -d)"
  export SMTP_PORT=587 SMTP_HOST=smtp.example.org SMTP_USER=x POCKET_ID_SMTP_TLS=starttls
  export POCKET_ID_FRONTEND_URL=https://auth.example POCKET_ID_URL=http://pocket-id:1411 POCKET_ID_DOMAIN=id.example
  run bash "$FLUX_RENDER" --out "$out"
  rm -rf "$out"
  [ "$status" -eq 0 ]
  [[ "$output" == *"validation gate passed"* ]]
  [[ "$output" != *"VALIDATION FAILED"* ]]
  [[ "$output" != *"could not determine a constructor"* ]]
}

@test "T002236: the validation gate still rejects a manifest doc without apiVersion" {
  # The value-key constructor must not soften the rest of the gate. A doc missing
  # apiVersion has to keep failing, otherwise the fix would trade one silent
  # deploy freeze for silently pushing a broken artifact.
  run python3 -c "
import yaml, sys
yaml.SafeLoader.add_constructor(
    'tag:yaml.org,2002:value', lambda loader, node: loader.construct_scalar(node))
docs = list(yaml.safe_load_all('kind: ConfigMap\nmetadata:\n  name: x\n'))
for i, doc in enumerate(docs):
    if doc is None:
        continue
    if not doc.get('apiVersion'):
        print('ERROR: doc %d has no apiVersion' % i, file=sys.stderr)
        sys.exit(1)
"
  [ "$status" -ne 0 ]
  [[ "$output" == *"no apiVersion"* ]]
}

@test "T002236: the value-key constructor parses the upstream matchType enum" {
  # Pin the exact upstream shape that broke the gate, so a future loader swap that
  # reintroduces the strictness fails here rather than in the post-merge workflow.
  run python3 -c "
import yaml
yaml.SafeLoader.add_constructor(
    'tag:yaml.org,2002:value', lambda loader, node: loader.construct_scalar(node))
doc = yaml.safe_load('''
apiVersion: v1
matchType:
  enum:
  - '!='
  - =
  - =~
  - '!~'
''')
vals = doc['matchType']['enum']
assert len(vals) == 4, vals
print('parsed:', vals)
"
  [ "$status" -eq 0 ]
  [[ "$output" == *"parsed:"* ]]
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
  # No unsubstituted ${...} placeholder from the allowlist may survive in any rendered manifest.
  local leftover
  leftover="$(grep -rE '\$\{(PROD_DOMAIN|BRAND_NAME|CONTACT_EMAIL|INFRA_NAMESPACE|TLS_SECRET_NAME|SMTP_FROM|SMTP_HOST|SMTP_PORT|SMTP_USER|MAIL_FROM_LOCAL|MAIL_FROM_DOMAIN|POCKET_ID_SMTP_TLS|WEBSITE_IMAGE|BRETT_IMAGE|TURN_PUBLIC_IP|TURN_NODE|TURN_OVERLAY_IP|TERMINAL_OVERLAY_IP|BRAND_ID|KC_USER1_USERNAME|KC_USER1_EMAIL|KC_USER2_USERNAME|KC_USER2_EMAIL|BRETT_DOMAIN|BRAIN_EXTERNAL_URL|RECOVER_DOMAIN|OTEL_DOMAIN|STUDIO_DOMAIN|STUDIO_IMAGE|STUDIO_IMAGE_DIGEST|WHISPER_URL|WORKSPACE_NAMESPACE|WEBSITE_NAMESPACE|SYSTEMTEST_LOOP_ENABLED|LLM_HOST_IP|LLM_ENABLED|LLM_RERANK_ENABLED|LLM_ROUTER_URL|LLM_EMBED_URL|COMFY_HOST_IP|COMFY_PORT|RIGGER_HOST_IP|RIGGER_PORT|NTFY_BASE_URL|AGENT_PUSH_API|AGENT_PUSH_LINK_BASE|DEV_DOMAIN|DEV_NODE|DEV_WEBSITE_HOST|DEV_BRETT_HOST|POCKET_ID_DOMAIN|POCKET_ID_FRONTEND_URL|POCKET_ID_URL)\}' "$out" || true)"
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
  # T002181: der Test erwartete `kind: OCIRepository` in derselben Datei wie die
  # FluxInstance. Real sind die CRs auf flux-instance.yaml und oci-source.yaml
  # aufgeteilt — die Quelle existiert, nur nicht dort, wo gesucht wurde.
  run bash -c "grep -rIl 'kind:[[:space:]]*FluxInstance' '$FLUX_CLUSTER_DIR'"
  [ "$status" -eq 0 ]
  run bash -c "grep -rIlE 'kind:[[:space:]]*OCIRepository' '$FLUX_CLUSTER_DIR'"
  [ "$status" -eq 0 ]
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
# T002181: erwartet wurden die Einzelnamen 'flux-sealed-secrets' und
# 'flux-platform'. Die Kustomizations sind inzwischen brand-spezifisch
# aufgeteilt (…-mentolder / …-korczewski) und die Plattform-Schicht heisst
# flux-infra-controllers. Geprüft wird jetzt über Präfixe, damit ein künftiger
# dritter Brand automatisch mit abgedeckt ist.
sealed = {n for n in names if n and n.startswith('flux-sealed-secrets')}
assert sealed, f'no flux-sealed-secrets* Kustomization (have {sorted(n for n in names if n)})'
assert 'flux-infra-controllers' in names, f'flux-infra-controllers Kustomization missing (have {sorted(n for n in names if n)})'
# At least one dependsOn edge must wire the chain together.
assert any(k.get('spec', {}).get('dependsOn') for k in ks), 'no Kustomization declares dependsOn'
PY
  [ "$status" -eq 0 ]
}

@test "T002083: flux-sealed-secrets Kustomization sets prune: false (secrets never auto-pruned)" {
  run python3 - "$FLUX_CLUSTER_DIR" <<'PY'
import sys, pathlib, yaml
d = pathlib.Path(sys.argv[1])
# T002181: geprüft wurde nur die Kustomization mit dem exakten Namen
# 'flux-sealed-secrets'. Die gibt es nicht mehr — real existieren
# flux-sealed-secrets-mentolder und -korczewski. Der Test lief damit gegen
# einen Namen ins Leere, obwohl beide prune: false korrekt setzen.
# Jetzt strenger: JEDE flux-sealed-secrets*-Kustomization muss prune: false
# tragen, nicht nur eine.
found = []
for f in list(d.rglob('*.yaml')) + list(d.rglob('*.yml')):
    for doc in yaml.safe_load_all(f.read_text()):
        if not doc:
            continue
        name = doc.get('metadata', {}).get('name') or ''
        if doc.get('kind') == 'Kustomization' and name.startswith('flux-sealed-secrets'):
            found.append(doc)
assert found, 'no flux-sealed-secrets* Kustomization found'
offenders = [
    d_.get('metadata', {}).get('name')
    for d_ in found
    if d_.get('spec', {}).get('prune') is not False
]
assert not offenders, f'these flux-sealed-secrets* Kustomizations must set spec.prune: false — {offenders}'
PY
  [ "$status" -eq 0 ]
}

@test "T002083: flux/clusters/fleet CRs carry no unsubstituted \${VAR} placeholders" {
  # The cluster-side CRs are committed static (not envsubst-rendered) → must be literal.
  # Note: bootstrap/ directory resources (e.g. ingressroute-flux-webhook) are templated at bootstrap time.
  local leftover
  leftover="$(find "$FLUX_CLUSTER_DIR" -maxdepth 1 -name "*.yaml" -exec grep -l '\${' {} + || true)"
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


# ── Image-Tag reaches the rendered manifest (T002209) ──────────────────
#
# render-fleet-artifact.yml passes the freshly built SHA tag as the env var
# WEBSITE_IMAGE_TAG, but flux-render-artifact.sh only ever read the CLI flag
# --website-image, and Taskfile's flux:render passes only --out. The value
# arrived and was never consumed, so the manifest kept :latest — and because
# the manifest content never changed between builds, Flux had nothing to
# apply. Green build, green render, no rollout.
#
# Same class as T001396/T001400 above: a value supplied on one side and not
# read on the other. It does not fail, it defaults.

RENDER_SCRIPT="${PROJECT_DIR}/scripts/flux-render-artifact.sh"
WEBSITE_MANIFEST="${PROJECT_DIR}/k3d/website.yaml"

@test "website manifest does not hardcode the image tag" {
  # ghcr.io/paddione/${WEBSITE_IMAGE}:latest makes only the NAME variable.
  # An override would then replace the name, turning a tag like
  # sha-20260726-abc into ghcr.io/paddione/sha-20260726-abc:latest.
  run grep -c 'image: ghcr.io/paddione/${WEBSITE_IMAGE}:latest' "$WEBSITE_MANIFEST"
  [ "$output" -eq 0 ]
}

@test "website manifest templates the image tag" {
  run grep -q 'WEBSITE_IMAGE_TAG' "$WEBSITE_MANIFEST"
  [ "$status" -eq 0 ]
}

@test "flux render script reads WEBSITE_IMAGE_TAG from the environment" {
  run grep -q 'WEBSITE_IMAGE_TAG' "$RENDER_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "flux render script reads BRETT_IMAGE_DIGEST from the environment" {
  # T002706: brett delivery switched from mutable tag to immutable digest.
  run grep -q 'BRETT_IMAGE_DIGEST' "$RENDER_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "every envsubst list carrying WEBSITE_IMAGE also carries WEBSITE_IMAGE_TAG" {
  # The allowlists are fail-closed (T001993): a placeholder missing from the
  # list renders to an empty string, producing "image: ghcr.io/paddione/website:".
  # That is the notify_push/bin/$/ failure mode in a different file.
  local missing=0
  while IFS= read -r line; do
    case "$line" in
      *'$WEBSITE_IMAGE_TAG'*) ;;
      *) echo "MISSING WEBSITE_IMAGE_TAG in: ${line:0:110}"; missing=1 ;;
    esac
  done < <(grep -h 'WEBSITE_IMAGE' "${PROJECT_DIR}/Taskfile.yml" | grep -E 'ENVSUBST_VARS|envsubst')
  [ "$missing" -eq 0 ]
}

@test "the tag placeholder always has a value so it never renders empty" {
  # envsubst has no ${VAR:-default}; the default must be set by the caller.
  run grep -qE 'WEBSITE_IMAGE_TAG:?[=-]' "$RENDER_SCRIPT"
  [ "$status" -eq 0 ]
}

# ── Blast-Radius-Eingrenzung (T002207) ─────────────────────────────────
#
# Flux-Health-Gate: ein kaputter Workload soll nicht die gesamte Marken-
# Kustomization blockieren. Diese Tests stellen die Invarianten sicher,
# nachdem die Jobs aus dem App-Stack entfernt, healthChecks explizit
# gesetzt und der Renderer erweitert wurde.

FLUX_CLUSTER_DIR="${PROJECT_DIR}/flux/clusters/fleet"

@test "T002207: brand Kustomization does not set bare wait:true (requires healthChecks)" {
  for ks in ks-mentolder.yaml ks-korczewski.yaml; do
    run grep -q '^\s*wait:\s*true$' "${FLUX_CLUSTER_DIR}/${ks}"
    [ "$status" -ne 0 ] || {
      echo "FAIL: ${ks} still sets bare wait:true without healthChecks"
      return 1
    }
  done
}

@test "T002207: brand Kustomization declares healthChecks list" {
  for ks in ks-mentolder.yaml ks-korczewski.yaml; do
    run grep -q 'healthChecks:' "${FLUX_CLUSTER_DIR}/${ks}"
    [ "$status" -eq 0 ] || {
      echo "FAIL: ${ks} has no healthChecks"
      return 1
    }
  done
}

@test "T002207: jobs Kustomization exists for each brand" {
  for ks in ks-jobs-mentolder.yaml ks-jobs-korczewski.yaml; do
    [ -f "${FLUX_CLUSTER_DIR}/${ks}" ] || {
      echo "FAIL: ${FLUX_CLUSTER_DIR}/${ks} does not exist"
      return 1
    }
  done
}

@test "T002207: jobs Kustomization has dependsOn: [flux-<brand>] and force:true" {
  for brand in mentolder korczewski; do
    local ks="${FLUX_CLUSTER_DIR}/ks-jobs-${brand}.yaml"
    [ -f "$ks" ] || continue  # skip if not yet created (RED phase fails earlier)
    run grep -q "dependsOn:" "$ks"
    [ "$status" -eq 0 ] || { echo "FAIL: ${ks} missing dependsOn"; return 1; }
    run grep -q "force:\s*true" "$ks"
    [ "$status" -eq 0 ] || { echo "FAIL: ${ks} missing force:true"; return 1; }
  done
}

@test "T002207: no kind: Job in rendered brand component trees" {
  # Render the artifact tree and check that brand dirs contain no Job
  local out_dir
  out_dir="$(mktemp -d)"
  bash "${RENDER_SCRIPT}" --out "$out_dir" 2>/dev/null || true
  for brand in mentolder korczewski; do
    local manifest="${out_dir}/${brand}/${brand}.yaml"
    if [ -f "$manifest" ]; then
      run grep -c "^kind: Job" "$manifest"
      [ "$output" -eq 0 ] || {
        echo "FAIL: ${brand} overlay contains $output Job(s) — should be 0"
        return 1
      }
    fi
  done
  rm -rf "$out_dir"
}

@test "T002207: rendered jobs component trees contain kind: Job" {
  local out_dir
  out_dir="$(mktemp -d)"
  bash "${RENDER_SCRIPT}" --out "$out_dir" 2>/dev/null || true
  for brand in mentolder korczewski; do
    local manifest="${out_dir}/${brand}-jobs/${brand}-jobs.yaml"
    if [ -f "$manifest" ]; then
      run grep -c "^kind: Job" "$manifest"
      [ "$output" -ge 1 ] || {
        echo "FAIL: ${brand}-jobs overlay contains 0 Jobs — expected at least 1"
        return 1
      }
    fi
  done
  rm -rf "$out_dir"
}

@test "T002207: render script has validation gate before push" {
  run grep -qE 'validate|dry.?run|kubeval|schema' "$RENDER_SCRIPT"
  [ "$status" -eq 0 ] || {
    echo "FAIL: render script has no validation gate"
    return 1
  }
}

# ═══════════════════════════════════════════════════════════════════
# T002251: Flux-Bootstrap-SealedSecrets müssen echte, entschlüsselbare
# Ciphertexte tragen. In main standen dort die Platzhalter aus der
# T002083-Bootstrap-PR (AgD_dummy_encrypted_…) — der Controller auf fleet
# scheiterte mit "illegal base64 data at input byte 3" (das '_' ist kein
# Base64-Zeichen), beide Ressourcen SYNCED=False.
#
# Die Tests prüfen FORM, nicht Entschlüsselbarkeit: die Ciphertexte gelten
# nur für den aktuellen Controller-Key, ein Cert-Rotate würde einen
# Decrypt-Test rot machen ohne echten Bug. Live-Verifikation (SYNCED=True)
# läuft im Verify-Task gegen den Cluster.
# ═══════════════════════════════════════════════════════════════════

FLUX_BOOTSTRAP_DIR="${PROJECT_DIR}/flux/clusters/fleet/bootstrap"

# Listet alle SealedSecret-Dateien im Bootstrap-Verzeichnis.
_flux_bootstrap_sealedsecrets() {
  find "$FLUX_BOOTSTRAP_DIR" -maxdepth 1 -name '*sealedsecret*.yaml' -type f | sort
}

@test "T002251: no Flux bootstrap SealedSecret carries a placeholder ciphertext" {
  local found=0 f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if grep -qE ':[[:space:]]*AgD_dummy' "$f"; then
      echo "FAIL: $(basename "$f") trägt einen Platzhalter-Ciphertext:"
      grep -nE ':[[:space:]]*AgD_dummy' "$f" | sed 's/^/  /'
      echo "      Der Sealed-Secrets-Controller kann das nicht dekodieren"
      echo "      ('illegal base64 data at input byte 3' — das '_' ist kein Base64)."
      echo "      Neu sealen: kubectl --context fleet -n flux-system get secret <name> -o yaml"
      echo "                  | kubeseal --cert environments/certs/fleet-mentolder.pem --format yaml"
      found=1
    fi
  done < <(_flux_bootstrap_sealedsecrets)
  [ "$found" -eq 0 ]
}

@test "T002251: every Flux bootstrap SealedSecret declares spec.template.metadata" {
  # PyYAML statt grep: ein SealedSecret hat ZWEI metadata-Blöcke (metadata und
  # spec.template.metadata). Ein flaches grep zählt beide und meldet fälschlich
  # "vorhanden", wenn nur der äußere existiert.
  local f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    run python3 -c "
import sys, yaml
doc = yaml.safe_load(open(sys.argv[1]))
tmpl = ((doc or {}).get('spec') or {}).get('template') or {}
md = tmpl.get('metadata') or {}
missing = [k for k in ('name', 'namespace') if not md.get(k)]
if missing:
    print('missing: ' + ', '.join('spec.template.metadata.' + m for m in missing))
    sys.exit(1)
" "$f"
    [ "$status" -eq 0 ] || {
      echo "FAIL: $(basename "$f") — $output"
      echo "      Ohne template.metadata kann der Controller das Ziel-Secret"
      echo "      nicht erzeugen. kubeseal --format yaml schreibt den Block mit."
      return 1
    }
  done < <(_flux_bootstrap_sealedsecrets)
}

# ── Copy-Paste-Guard ────────────────────────────────────────────────
# Motivation: im geretteten Stash (rescue/flux-bootstrap-secrets-stash11)
# stand in BEIDEN Bootstrap-Dateien derselbe Ciphertext (SHA256 identisch,
# je 936 Zeichen). Sealed-secrets bindet den Ciphertext im Default-Modus
# (strict scope) an namespace/name — derselbe Blob kann also für höchstens
# eines der beiden Secrets entschlüsseln. Wäre das gemergt worden, hätte es
# genau so ausgesehen wie ein Fix und wäre zur Hälfte still kaputt geblieben.
#
# ACHTUNG bei der Reichweite: identische Ciphertexte sind NICHT per se falsch.
# Die 6 brand-übergreifenden Secrets (monitoring/grafana-oidc,
# alertmanager-smtp, alertmanager-pushover, otel-collector-auth,
# cert-manager/ipv64-api-key, workspace-office/collabora-secrets) stehen
# legitim byte-identisch in environments/sealed-secrets/fleet-mentolder.yaml
# UND fleet-korczewski.yaml — gleicher namespace/name, gleicher Key.
# Ein blanker "kein Duplikat"-Test wäre dort falsch-positiv.
#
# Entschiedene Policy (2026-07-27):
#   1. Reichweite  — repo-weit über alle getrackten SealedSecrets. Die Bug-Klasse
#      ist nicht bootstrap-spezifisch; ein kopierter Blob ist überall still
#      halb-kaputt.
#   2. Schlüssel   — Identität ist (metadata.namespace, metadata.name). Ein
#      geteilter Ciphertext ist NUR bei abweichender Identität ein Fehler; damit
#      sind die 6 brand-übergreifenden Secrets sauber ausgenommen.
#   3. Granularität — pro encryptedData-Wert, denn dort entsteht der Ciphertext.
#   4. Ausnahme    — Dokumente mit namespace-wide/cluster-wide Scope-Annotation.
#      Dort ist der Ciphertext NICHT an den Namen gebunden, ein Reuse also legitim.
#      Aktuell sind alle 25 SealedSecrets strict; die Ausnahme ist Vorsorge.
@test "T002251: no two SealedSecrets with different identities share a ciphertext" {
  run env PROJECT_DIR="$PROJECT_DIR" python3 - <<'PY'
import os, subprocess, sys, yaml
from collections import defaultdict

# Explizit an PROJECT_DIR gebunden — 'git ls-files' waere sonst cwd-abhaengig und
# der Test wuerde je nach Aufrufort eine andere Dateimenge scannen.
ROOT = os.environ['PROJECT_DIR']
files = subprocess.run(
    ['git', '-C', ROOT, 'ls-files', '-z', '*.yaml', '*.yml'],
    capture_output=True, text=True, check=True,
).stdout.split('\0')

SCOPE_ANNOTATIONS = ('sealedsecrets.bitnami.com/namespace-wide',
                     'sealedsecrets.bitnami.com/cluster-wide')

# ciphertext -> {(namespace, name)} und ciphertext -> [Fundstelle]
identities = defaultdict(set)
sites = defaultdict(list)

unparseable = []

for path in files:
    if not path:
        continue
    full = os.path.join(ROOT, path)
    try:
        with open(full) as fh:
            raw = fh.read()
    except (OSError, UnicodeDecodeError):
        continue
    if 'SealedSecret' not in raw:
        continue          # billiger Vorfilter — 447 YAMLs, nur ~10 sind SealedSecrets
    try:
        docs = list(yaml.safe_load_all(raw))
    except yaml.YAMLError as exc:
        # NICHT still überspringen: eine unparsbare Datei, die textuell nach
        # SealedSecret aussieht, wäre ein blinder Fleck genau in der Klasse, die
        # dieser Guard abdecken soll.
        unparseable.append(f'{path}: {type(exc).__name__}')
        continue
    for doc in docs:
        if not isinstance(doc, dict) or doc.get('kind') != 'SealedSecret':
            continue
        md = doc.get('metadata') or {}
        ann = md.get('annotations') or {}
        if any(str(ann.get(a, '')).lower() == 'true' for a in SCOPE_ANNOTATIONS):
            continue      # non-strict scope: Reuse über Namen hinweg ist erlaubt
        ident = (md.get('namespace') or '<none>', md.get('name') or '<none>')
        for key, ct in ((doc.get('spec') or {}).get('encryptedData') or {}).items():
            if not isinstance(ct, str) or not ct:
                continue
            identities[ct].add(ident)
            sites[ct].append(f'{path} [{ident[0]}/{ident[1]}] key={key}')

if unparseable:
    print('FAIL: Dateien mit SealedSecret-Bezug sind nicht parsebar — der Guard')
    print('      koennte sie nicht pruefen (blinder Fleck):')
    for u in unparseable:
        print(f'  {u}')
    sys.exit(1)

shared = {ct: ids for ct, ids in identities.items() if len(ids) > 1}
if shared:
    for ct, ids in shared.items():
        print('FAIL: derselbe Ciphertext unter verschiedenen Identitaeten:')
        for site in sorted(set(sites[ct])):
            print(f'  {site}')
        print('      Sealed-secrets bindet den Ciphertext im Default-Modus (strict')
        print('      scope) an namespace/name. Er kann daher fuer hoechstens EINE')
        print('      dieser Identitaeten entschluesseln — der Rest bleibt still kaputt.')
        print('      Jede Identitaet einzeln sealen:')
        print('        kubectl -n <ns> get secret <name> -o yaml | kubeseal --cert <cert> --format yaml')
    sys.exit(1)
PY
  [ "$status" -eq 0 ] || {
    echo "$output"
    return 1
  }
}
