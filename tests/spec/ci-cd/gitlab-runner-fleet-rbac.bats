#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-runner-fleet-rbac.bats — Role statt ClusterRole, kein
# SA-Token in Job-Pods [T012177]
#
# PRUEFMODUS: Struktur-Inspektion, gleiche Render-Basis wie
# gitlab-runner-fleet-guardrails.bats (kubectl kustomize + yaml.safe_load_all, kein
# Cluster-Zugriff). specs/ci-cd.md, Requirement "CI-Jobs erhalten keinen Cluster-Zugriff":
# automountServiceAccountToken: false auf den Job-Pods, RBAC des Runner-Managers ist
# ausschliesslich Role/RoleBinding im eigenen Namespace.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  STACK_DIR="${REPO_ROOT}/k3d/gitlab-runner-stack"
  RENDERED_FILE="$(mktemp)"
}

teardown() {
  rm -f "$RENDERED_FILE"
}

_render_to_file() {
  if [ ! -d "$STACK_DIR" ]; then
    echo "erwartetes Verzeichnis fehlt: $STACK_DIR" >&2
    return 1
  fi
  if ! kubectl kustomize "$STACK_DIR" --load-restrictor=LoadRestrictionsNone >"$RENDERED_FILE" 2>/tmp/gitlab-runner-fleet-rbac.err.$$; then
    echo "kubectl kustomize $STACK_DIR ist fehlgeschlagen:" >&2
    cat /tmp/gitlab-runner-fleet-rbac.err.$$ >&2
    rm -f /tmp/gitlab-runner-fleet-rbac.err.$$
    return 1
  fi
  rm -f /tmp/gitlab-runner-fleet-rbac.err.$$
}

@test "gitlab-runner-fleet-rbac: gerendertes Manifest enthaelt mindestens ein RBAC-Objekt (Positiv-Anker)" {
  _render_to_file

  # Positiv-Anker [T002356-M1]: ohne mindestens ein RBAC-Objekt waere "keine
  # ClusterRole vorhanden" bei einem leeren Manifest trivial wahr.
  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

rbac_kinds = {"Role", "RoleBinding", "ClusterRole", "ClusterRoleBinding", "ServiceAccount"}
hit = any(d.get("kind") in rbac_kinds for d in docs)
print("OK" if hit else "MISSING")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-fleet-rbac: kein ClusterRole und kein ClusterRoleBinding im Manifest" {
  _render_to_file

  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

offenders = [d.get("kind") for d in docs if d.get("kind") in ("ClusterRole", "ClusterRoleBinding")]
print("OK" if not offenders else "FOUND:" + ",".join(offenders))
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-fleet-rbac: Role und RoleBinding sind im Namespace gitlab-runner deklariert" {
  _render_to_file

  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

roles = [d for d in docs if d.get("kind") == "Role"]
bindings = [d for d in docs if d.get("kind") == "RoleBinding"]

has_role = any((r.get("metadata") or {}).get("namespace") == "gitlab-runner" for r in roles)
has_binding = any((b.get("metadata") or {}).get("namespace") == "gitlab-runner" for b in bindings)

if not roles:
    print("NO_ROLE")
elif not bindings:
    print("NO_ROLEBINDING")
elif not has_role:
    print("ROLE_WRONG_NAMESPACE")
elif not has_binding:
    print("ROLEBINDING_WRONG_NAMESPACE")
else:
    print("OK")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-fleet-rbac: Job-Pod-Template mountet kein ServiceAccount-Token" {
  _render_to_file

  # Positiv-Anker [T002356-M1]: das Runner-Deployment muss zuerst gefunden werden,
  # sonst waere "kein Token gemountet" bei fehlendem Manifest vakuos wahr.
  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

deploys = [
    d for d in docs
    if d.get("kind") in ("Deployment", "StatefulSet") and (d.get("metadata") or {}).get("name") == "gitlab-runner"
]
if not deploys:
    print("MISSING")
    sys.exit()

pod_spec = ((deploys[0].get("spec") or {}).get("template") or {}).get("spec") or {}

# automountServiceAccountToken kann am Pod-Template ODER am ServiceAccount-Objekt
# gesetzt sein — beide Stellen pruefen (p4-tests.md).
pod_level = pod_spec.get("automountServiceAccountToken")

sa_name = pod_spec.get("serviceAccountName") or pod_spec.get("serviceAccount")
sa_level = None
if sa_name:
    for d in docs:
        if d.get("kind") == "ServiceAccount" and (d.get("metadata") or {}).get("name") == sa_name:
            sa_level = d.get("automountServiceAccountToken")
            break

# Konfig-Text ("runners.config") kann automount_service_account_token = false auch
# als [runners.kubernetes]-Feld tragen — das gilt fuer die vom Manager erzeugten
# Job-Pods (nicht den Manager-Pod selbst) und steckt als Secret/ConfigMap-Daten im
# gerenderten Manifest.
config_level = False
for d in docs:
    if d.get("kind") in ("Secret", "ConfigMap"):
        data = d.get("stringData") or d.get("data") or {}
        for v in data.values():
            if isinstance(v, str) and "automount_service_account_token = false" in v:
                config_level = True

if pod_level is False or sa_level is False or config_level:
    print("OK")
else:
    print("TOKEN_MOUNTED_OR_UNSET")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-fleet-rbac: registry-cache-Deployment mountet kein ServiceAccount-Token" {
  _render_to_file

  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

deploys = [
    d for d in docs
    if d.get("kind") in ("Deployment", "StatefulSet") and (d.get("metadata") or {}).get("name") == "registry-cache"
]
if not deploys:
    print("MISSING")
    sys.exit()

pod_spec = ((deploys[0].get("spec") or {}).get("template") or {}).get("spec") or {}
print("OK" if pod_spec.get("automountServiceAccountToken") is False else "TOKEN_MOUNTED_OR_UNSET")
PY
)"
  [ "$result" = "OK" ]
}
