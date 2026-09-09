#!/usr/bin/env bats
# tests/spec/workspace-deploy/flux-secrets-ordering.bats
# SSOT: openspec/specs/workspace-deploy.md + openspec/changes/flux-secrets-ordering/specs/workspace-deploy.md
# Covers T900014: brand/staging Kustomizations must reconcile AFTER their matching
# Sealed Secrets Kustomization (dependsOn ordering), so Secret keys exist before
# any workload referencing them is applied (shared-db race from T900011).
#
# Pruefmodus: Querschnitts-Grep + YAML-Parsing via python3 — das Ergebnis
# manifestiert sich ausschliesslich im Quelltext der Flux-CRs (kein
# Laufzeitverhalten messbar), daher ist Source-Verifikation hier das
# angemessene Mittel. Kein yq: in CI nicht installiert (kein Treffer in
# .github/workflows/), python3+yaml ist durch bestehende Tests belegt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FLUX_DIR="${REPO_ROOT}/flux/clusters/fleet"
}

# dependsOn-Namen einer Brand-Kustomization als Zeilenliste (eine Zeile je Name).
_brand_depends_on() {
  python3 - "$FLUX_DIR/$1" <<'PY'
import sys, yaml
with open(sys.argv[1]) as f:
    doc = yaml.safe_load(f)
for dep in (doc.get('spec', {}).get('dependsOn') or []):
    print(dep.get('name', ''))
PY
}

@test "T900014: sealed-secrets Kustomizations exist for mentolder, korczewski and staging" {
  # Positiv-Anker: die Ordnungsziele muessen ueberhaupt existieren — sonst waere
  # "Brand haengt an Secrets-Kustomization" vakuos (T002356-M1).
  run python3 - "$FLUX_DIR/ks-sealed-secrets.yaml" <<'PY'
import sys, yaml
with open(sys.argv[1]) as f:
    names = {d.get('metadata', {}).get('name') for d in yaml.safe_load_all(f) if d and d.get('kind') == 'Kustomization'}
for want in ('flux-sealed-secrets-mentolder', 'flux-sealed-secrets-korczewski', 'flux-sealed-secrets-staging'):
    assert want in names, f'missing Kustomization {want} (have {sorted(names)})'
print('OK: all three flux-sealed-secrets-* Kustomizations present')
PY
  [ "$status" -eq 0 ]
}

@test "T900014: brand and staging Kustomizations dependOn their matching sealed-secrets Kustomization" {
  for mapping in "ks-mentolder.yaml:flux-sealed-secrets-mentolder" "ks-korczewski.yaml:flux-sealed-secrets-korczewski" "ks-staging.yaml:flux-sealed-secrets-staging"; do
    ks="${mapping%%:*}"
    want="${mapping##*:}"
    deps="$(_brand_depends_on "$ks")"
    # Positiv-Anker: infra-controllers-Kante bleibt bestehen (kein Ersatz, sondern Ergaenzung).
    echo "$deps" | grep -q '^flux-infra-controllers$' || {
      echo "FAIL: ${ks} lost its flux-infra-controllers dependsOn (have: ${deps})"
      return 1
    }
    echo "$deps" | grep -q "^${want}\$" || {
      echo "FAIL: ${ks} missing dependsOn ${want} (have: ${deps})"
      return 1
    }
  done
}

@test "T900014: no cross-brand or infra blocking introduced by the new edges" {
  for mapping in "ks-mentolder.yaml:flux-sealed-secrets-mentolder" "ks-korczewski.yaml:flux-sealed-secrets-korczewski" "ks-staging.yaml:flux-sealed-secrets-staging"; do
    ks="${mapping%%:*}"
    own="${mapping##*:}"
    deps="$(_brand_depends_on "$ks")"
    # Positiv-Anker im selben Test (T002356-M1): eigene Kante vorhanden ...
    echo "$deps" | grep -q "^${own}\$" || {
      echo "FAIL: ${ks} missing its own dependsOn ${own}"
      return 1
    }
    # ... und keine fremde Secrets-Kante blockiert diesen Stack.
    foreign="$(echo "$deps" | grep '^flux-sealed-secrets-' | grep -v "^${own}\$" || true)"
    [ -z "$foreign" ] || {
      echo "FAIL: ${ks} waits on foreign secrets Kustomization(s): ${foreign}"
      return 1
    }
  done
  # Secrets-Kustomizations duerfen selbst auf nichts warten (kein Zyklus, kein
  # Warten auf Infra — sie sind die Wurzel der Kette).
  run python3 - "$FLUX_DIR/ks-sealed-secrets.yaml" <<'PY'
import sys, yaml
with open(sys.argv[1]) as f:
    docs = [d for d in yaml.safe_load_all(f) if d and d.get('kind') == 'Kustomization']
offenders = [d.get('metadata', {}).get('name') for d in docs if d.get('spec', {}).get('dependsOn')]
assert not offenders, f'secrets Kustomizations must not declare dependsOn (would cycle/block): {offenders}'
print('OK: secrets Kustomizations declare no dependsOn')
PY
  [ "$status" -eq 0 ]
}
