#!/usr/bin/env bats
# tests/spec/fleet-operations/penpot-manifests.bats
# SSOT: openspec/changes/add-penpot-service/specs/fleet-operations.md
#
# Validates: Penpot domain registry, manifest structure, shared-db role,
# and absence of hardcoded hostnames.

setup() {
  load '../test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "Penpot domain is registered (dev configmap + schema + prod overlays)" {
  grep -q 'PENPOT_DOMAIN' "${REPO_ROOT}/k3d/configmap-domains.yaml"
  grep -q 'PENPOT_DOMAIN' "${REPO_ROOT}/environments/schema.yaml"
  grep -q 'PENPOT_DOMAIN' "${REPO_ROOT}/prod/configmap-domains.yaml"
  # Der Prod-Wert kommt brand-neutral aus der Env-Registry durch envsubst,
  # nicht aus einem per-Brand-Patch mit hartkodiertem Host (S3-Gate).
  grep -q 'PENPOT_DOMAIN' "${REPO_ROOT}/environments/mentolder.yaml"
  grep -q 'PENPOT_DOMAIN' "${REPO_ROOT}/environments/korczewski.yaml"
  # Ohne Eintrag in beiden ENVSUBST_VARS-Listen (workspace:deploy und
  # flux:render) bliebe der Platzhalter im gerenderten ConfigMap stehen.
  # Anker ist der ENVSUBST_VARS-Kontext, nicht das Zeilenende (T900002): am Zeilenende
  # verankert brach die Zusicherung, sobald eine weitere Variable angehaengt wurde; ganz
  # ohne Anker matchen auch die beiden Website-envsubst-Listen (Z. 4309/4345).
  [ "$(grep -cF 'ENVSUBST_VARS \$BRETT_DOMAIN \$PENPOT_DOMAIN' "${REPO_ROOT}/Taskfile.yml")" -eq 2 ]
}

@test "Penpot dev domain resolves to design.localhost" {
  grep -q 'PENPOT_DOMAIN: "design.localhost"' "${REPO_ROOT}/k3d/configmap-domains.yaml"
}

@test "Penpot manifest exists with Deployment and Service" {
  local f="${REPO_ROOT}/k3d/penpot.yaml"
  [ -f "$f" ]
  grep -q 'kind: Deployment' "$f"
  grep -q 'kind: Service' "$f"
  grep -q 'penpot-gateway' "$f"
  grep -q 'app: penpot' "$f"
  grep -q 'app: penminio' "$f"
}

@test "Penpot deployment has three containers (backend, frontend, gateway)" {
  local f="${REPO_ROOT}/k3d/penpot.yaml"
  [ -f "$f" ]
  grep -q 'name: penpot-backend' "$f"
  grep -q 'name: penpot-frontend' "$f"
  grep -q 'name: penpot-gateway' "$f"
}

@test "Penpot IngressRoute exists and references design domain" {
  local f="${REPO_ROOT}/k3d/penpot-ingress.yaml"
  [ -f "$f" ]
  grep -q 'design.localhost' "$f"
  grep -q 'penpot-gateway' "$f"
}

@test "Penpot role exists in shared-db" {
  local f="${REPO_ROOT}/k3d/shared-db.yaml"
  [ -f "$f" ]
  grep -q "penpot" "$f"
  # Check that penpot is in the DO $$ BEGIN block
  grep -q 'rolname = .penpot.' "$f" || grep -q "rolname = 'penpot'" "$f"
}

@test "Penpot secrets exist in workspace-secrets" {
  grep -q 'PENPOT_DB_PASSWORD' "${REPO_ROOT}/k3d/secrets.yaml"
  grep -q 'POCKET_ID_PENPOT_SECRET' "${REPO_ROOT}/k3d/secrets.yaml"
  grep -q 'PENPOT_SECRET_KEY' "${REPO_ROOT}/k3d/secrets.yaml"
  grep -q 'PENPOT_MINIO_SECRET_KEY' "${REPO_ROOT}/k3d/secrets.yaml"
}

@test "Penpot is in pocket-id-client-seed" {
  grep -q 'penpot' "${REPO_ROOT}/k3d/pocket-id-client-seed.yaml"
  grep -q 'POCKET_ID_PENPOT_SECRET' "${REPO_ROOT}/k3d/pocket-id-client-seed.yaml"
  grep -q 'design.' "${REPO_ROOT}/k3d/pocket-id-client-seed.yaml"
}

@test "Penpot kustomization includes penpot resources" {
  grep -q 'penpot.yaml' "${REPO_ROOT}/k3d/kustomization.yaml"
  grep -q 'penpot-ingress.yaml' "${REPO_ROOT}/k3d/kustomization.yaml"
}

@test "No hardcoded .de hostnames in Penpot dev manifests" {
  # Dev manifests must NOT contain real production domains
  local bad=""
  grep -rl 'mentolder\.de' "${REPO_ROOT}/k3d/penpot.yaml" "${REPO_ROOT}/k3d/penpot-ingress.yaml" 2>/dev/null && bad="yes"
  [ -z "$bad" ] || { echo "FAIL: hardcoded mentolder.de in dev manifests"; return 1; }
}

@test "T900002: PENPOT_PUBLIC_URI ist envsubst-verdrahtet statt auf die Dev-URL festgenagelt" {
  # Der Bug: k3d/penpot.yaml trug "http://design.localhost" als Literal, und kein
  # Prod-Overlay ueberschrieb es — der Prod-Render beider Brands emittierte die
  # Dev-URL als oeffentliche URI (Links, CORS, OIDC-Redirects).
  # Konvention wie POCKET_ID_FRONTEND_URL -> APP_URL in k3d/pocket-id.yaml.
  local f="${REPO_ROOT}/k3d/penpot.yaml"

  # 1. Kein Dev-Literal mehr am PENPOT_PUBLIC_URI-Schluessel.
  run grep -A 1 'name: PENPOT_PUBLIC_URI' "$f"
  [ "$status" -eq 0 ]
  [[ "$output" != *"design.localhost"* ]]

  # 2. Beide Container tragen den Platzhalter.
  [ "$(grep -cF 'value: "${PENPOT_PUBLIC_URI}"' "$f")" -eq 2 ]

  # 3. Ohne Eintrag in BEIDEN ENVSUBST_VARS-Listen (workspace:deploy und
  #    flux:render) bliebe der Platzhalter literal im Prod-Manifest stehen —
  #    das waere schlimmer als der urspruengliche Bug.
  [ "$(grep -cF '$PENPOT_PUBLIC_URI' "${REPO_ROOT}/Taskfile.yml")" -ge 2 ]

  # 4. Registry-Eintrag mit Dev-Default, damit dev ohne env-Datei aufloest.
  run grep -A 3 'name: PENPOT_PUBLIC_URI' "${REPO_ROOT}/environments/schema.yaml"
  [ "$status" -eq 0 ]
  [[ "$output" == *"default_dev"* ]]

  # 5. Jede Prod-Umgebung setzt einen eigenen Wert — sonst faellt sie still
  #    auf den Dev-Default zurueck und der Bug ist zurueck.
  local e
  for e in mentolder korczewski fleet-mentolder fleet-korczewski staging; do
    grep -q 'PENPOT_PUBLIC_URI' "${REPO_ROOT}/environments/${e}.yaml"       || { echo "environments/${e}.yaml definiert PENPOT_PUBLIC_URI nicht" >&2; return 1; }
  done
}

@test "T900009: Ingress-Eindeutigkeit unter envsubst - genau eins" {
  command -v envsubst >/dev/null 2>&1 || skip "envsubst not installed"
  source scripts/env-resolve.sh mentolder >/dev/null
  # Render mit ersetzten Variablen (so wie Flux es macht)
  local rendered
  rendered="$(kubectl kustomize prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone \
    | envsubst)"
  # Erwartet: genau ein Ingress namens workspace-ingress-penpot
  local count
  count="$(echo "$rendered" | grep -c 'name: workspace-ingress-penpot')"
  [ "$count" -eq 1 ]
  # Der Host muss design.<PROD_DOMAIN> sein, NICHT design.localhost
  [[ "$rendered" == *"design.${PROD_DOMAIN}"* ]]
}

@test "T900009: penminio-Ports sind benannt (api + console)" {
  local f="${REPO_ROOT}/k3d/penpot.yaml"
  # Beide Ports muessen einen Namen haben — Name steht vor port:, also -B1 nutzen.
  local content
  content="$(grep -B1 -A2 'port: 9000' "$f")"
  echo "$content" | grep -q 'name: api'
  content="$(grep -B1 -A2 'port: 9001' "$f")"
  echo "$content" | grep -q 'name: console'
}

@test "T900009: kustomization.yaml hat genau einen patches:-Schlussel" {
  local f="${REPO_ROOT}/prod-fleet/mentolder/kustomization.yaml"
  local count
  count="$(grep -c '^patches:' "$f")"
  [ "$count" -eq 1 ]
}
