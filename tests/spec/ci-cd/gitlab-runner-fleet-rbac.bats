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

@test "gitlab-runner-fleet-rbac: Manager-Pod (Deployment gitlab-runner) behaelt sein eigenes ServiceAccount-Token" {
  # N1/N4 (Nachreview T012177): umbenannt und geschaerft. Der alte Test hiess
  # "Job-Pod-Template mountet kein ServiceAccount-Token", prüfte aber die
  # MANAGER-PodSpec (Deployment gitlab-runner) — und akzeptierte
  # `pod_level is False` als Erfolg. Genau das war N1: ein Top-Level
  # automountServiceAccountToken: false in den Helm-Values landet in der
  # Manager-PodSpec (Chart-Template deployment.yaml), nicht bei den Job-Pods.
  # Ohne eigenes Token kann der Manager keine In-Cluster-Config bilden und
  # erzeugt NIE einen Job-Pod — dieser Test haette N1 also durchgewunken statt
  # ihn zu fangen. Er prueft jetzt das GEGENTEIL: der Manager MUSS sein Token
  # behalten (automountServiceAccountToken darf am Manager-Pod NICHT auf false
  # stehen). Die eigentliche Job-Pod-Absicherung hat einen eigenen Test unten.
  _render_to_file

  # Positiv-Anker [T002356-M1]: das Runner-Deployment muss zuerst gefunden werden.
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
pod_level = pod_spec.get("automountServiceAccountToken")

print("OK" if pod_level is not False else "TOKEN_DISABLED_ON_MANAGER")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-fleet-rbac: Job-Pods (runners.config-TOML) mounten kein ServiceAccount-Token" {
  _render_to_file

  # Positiv-Anker [T002356-M1]: die ConfigMap mit dem eingebetteten
  # runners.config-TOML muss zuerst existieren, sonst waere "kein Token
  # gemountet" bei fehlender Datei vakuos wahr.
  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

# Job-Pods werden vom Manager zur Laufzeit erzeugt und stehen NICHT im
# gerenderten Manifest — die einzige statisch pruefbare Quelle ist das
# eingebettete runners.config-TOML ([runners.kubernetes]
# automount_service_account_token = false), das der Manager beim Erzeugen
# jedes Job-Pods anwendet.
config_maps = [d for d in docs if d.get("kind") in ("Secret", "ConfigMap")]
if not config_maps:
    print("MISSING")
    sys.exit()

config_level = False
for d in config_maps:
    data = d.get("stringData") or d.get("data") or {}
    for v in data.values():
        if isinstance(v, str) and "automount_service_account_token = false" in v:
            config_level = True

print("OK" if config_level else "MISSING_CONFIG_KEY")
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
