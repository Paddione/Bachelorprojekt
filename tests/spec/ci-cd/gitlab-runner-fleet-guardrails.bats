#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-runner-fleet-guardrails.bats — vier Grenzen im gerenderten
# Manifest [T012177]
#
# PRUEFMODUS: Struktur-Inspektion. `kubectl kustomize k3d/gitlab-runner-stack/` wird
# gebaut und mit python3/yaml.safe_load_all strukturiert geparst — kein Cluster-Zugriff,
# analog zu tests/spec/ci-cd/gitlab-runner-tag-routing.bats. Der PriorityClass-`value`
# wird NUMERISCH verglichen, nicht als Zeichenkette (T002716) — genau die Zahlenzusicherung,
# gegen die dieser Guard gebaut ist. Der gerenderte YAML-Text landet in einer Temp-Datei
# und wird von den python3-Snippets per open() gelesen (nicht per Shell-Interpolation in
# einen Heredoc) — sonst koennten Anfuehrungszeichen/Backslashes im Manifest die Einbettung
# brechen.
#
# Design D2 (openspec/changes/gitlab-ci-k8s-runner-cache/design.md): vier voneinander
# unabhaengige Grenzen — ResourceQuota, LimitRange, PriorityClass (< Default), nodeAffinity
# (Worker-only). specs/ci-cd.md verlangt fuer die Node-Ausschluss-Zusicherung ausdruecklich
# nodeAffinity mit operator: In ueber beide Hostnamen — eine einfache nodeSelector-Label-Map
# genuegt laut Spec-Scenario NICHT, weil sie kein ODER ueber zwei Hostnamen ausdruecken kann.

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
  if ! kubectl kustomize "$STACK_DIR" --load-restrictor=LoadRestrictionsNone >"$RENDERED_FILE" 2>/tmp/gitlab-runner-fleet-guardrails.err.$$; then
    echo "kubectl kustomize $STACK_DIR ist fehlgeschlagen:" >&2
    cat /tmp/gitlab-runner-fleet-guardrails.err.$$ >&2
    rm -f /tmp/gitlab-runner-fleet-guardrails.err.$$
    return 1
  fi
  rm -f /tmp/gitlab-runner-fleet-guardrails.err.$$
}

@test "gitlab-runner-fleet-guardrails: gerendertes Manifest enthaelt einen Runner-Workload (Positiv-Anker)" {
  _render_to_file

  # Positiv-Anker [T002356-M1]: ohne diesen Nachweis waeren alle folgenden
  # "X fehlt nicht"-Aussagen bei einem leeren/kaputten Manifest trivial erfuellt.
  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

hit = any(
    d.get("kind") in ("Deployment", "StatefulSet")
    and (d.get("metadata") or {}).get("name") in ("gitlab-runner", "registry-cache")
    for d in docs
)
print("OK" if hit else "MISSING")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-fleet-guardrails: ResourceQuota im Namespace gitlab-runner mit gesetzten cpu/memory-Werten" {
  _render_to_file

  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

quotas = [
    d for d in docs
    if d.get("kind") == "ResourceQuota" and (d.get("metadata") or {}).get("namespace") == "gitlab-runner"
]
if not quotas:
    print("MISSING")
else:
    hard = (quotas[0].get("spec") or {}).get("hard") or {}
    has_cpu = bool(hard.get("cpu") or hard.get("requests.cpu"))
    has_mem = bool(hard.get("memory") or hard.get("requests.memory"))
    print("OK" if has_cpu and has_mem else "INCOMPLETE")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-fleet-guardrails: LimitRange im Namespace gitlab-runner mit Container-Default" {
  _render_to_file

  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

lrs = [
    d for d in docs
    if d.get("kind") == "LimitRange" and (d.get("metadata") or {}).get("namespace") == "gitlab-runner"
]
if not lrs:
    print("MISSING")
else:
    limits = (lrs[0].get("spec") or {}).get("limits") or []
    ok = any(
        (item.get("type") == "Container")
        and (
            (item.get("default") or {}).get("cpu")
            or (item.get("default") or {}).get("memory")
            or (item.get("defaultRequest") or {}).get("cpu")
            or (item.get("defaultRequest") or {}).get("memory")
        )
        for item in limits
    )
    print("OK" if ok else "INCOMPLETE")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-fleet-guardrails: PriorityClass ci-low liegt numerisch unter dem Cluster-Default" {
  _render_to_file

  result="$(python3 - "$RENDERED_FILE" <<'PY'
import sys
import yaml

with open(sys.argv[1]) as fh:
    docs = [d for d in yaml.safe_load_all(fh) if isinstance(d, dict)]

pcs = [d for d in docs if d.get("kind") == "PriorityClass"]
ci_low = next((d for d in pcs if (d.get("metadata") or {}).get("name") == "ci-low"), None)
if ci_low is None:
    print("MISSING")
else:
    default_value = next((d.get("value", 0) for d in pcs if d.get("globalDefault")), 0)
    print("OK" if ci_low.get("value", 0) < default_value else "TOO_HIGH")
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-fleet-guardrails: Runner-Pod-Template schliesst Control-Plane per nodeAffinity aus (kein nodeSelector genuegt)" {
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
affinity = (pod_spec.get("affinity") or {}).get("nodeAffinity") or {}
terms = (
    affinity.get("requiredDuringSchedulingIgnoredDuringExecution") or {}
).get("nodeSelectorTerms") or []

values = set()
for term in terms:
    for expr in term.get("matchExpressions") or []:
        if expr.get("key") == "kubernetes.io/hostname" and expr.get("operator") == "In":
            values.update(expr.get("values") or [])

expected = {"gekko-hetzner-3", "gekko-hetzner-4"}
print("OK" if expected.issubset(values) else "INCOMPLETE:" + ",".join(sorted(values)))
PY
)"
  [ "$result" = "OK" ]
}

@test "gitlab-runner-fleet-guardrails: Control-Plane-Knoten sind kein Match fuer die Runner-nodeAffinity" {
  _render_to_file

  # Belegt, dass die drei Control-Plane-Knoten (pk-hetzner-4/6/8) nicht Teil der
  # erlaubten values-Liste sind — sonst koennte ein CI-Pod dort landen.
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
affinity = (pod_spec.get("affinity") or {}).get("nodeAffinity") or {}
terms = (
    affinity.get("requiredDuringSchedulingIgnoredDuringExecution") or {}
).get("nodeSelectorTerms") or []

values = set()
for term in terms:
    for expr in term.get("matchExpressions") or []:
        if expr.get("key") == "kubernetes.io/hostname" and expr.get("operator") == "In":
            values.update(expr.get("values") or [])

cp_nodes = {"pk-hetzner-4", "pk-hetzner-6", "pk-hetzner-8"}
print("OK" if values.isdisjoint(cp_nodes) else "CP_LEAK:" + ",".join(sorted(values & cp_nodes)))
PY
)"
  [ "$result" = "OK" ]
}
